import { useEffect, useRef, useState } from 'react'
import { AIMD, levelLabel } from './aimd'
import type { DiagnosticTurn } from './learning'
import { readApiJson } from './storage'
import './diagnostic.css'
import { microphoneErrorMessage } from './micAccess'

type Props = {
  title: string
  turns: DiagnosticTurn[]
  busy: boolean
  done: boolean
  summary: string
  level: number
  planReady: boolean
  error: string
  onAnswer: (text: string) => void
  onClose: () => void
}

const SAMPLE_RATE = 16_000
const MAX_SECONDS = 28 // the local Whisper host takes at most 30 s per chunk

function speakInBrowser(text: string, onEnd: () => void) {
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voices = speechSynthesis.getVoices()
  const voice = voices.find(v => /^en/i.test(v.lang) && /natural|premium|enhanced|samantha|daniel/i.test(v.name)) || voices.find(v => /^en/i.test(v.lang))
  if (voice) utterance.voice = voice
  utterance.onend = onEnd
  utterance.onerror = onEnd
  speechSynthesis.speak(utterance)
}

/** Speaks in the tutor's local Qwen voice (24 kHz Int16 PCM over SSE); falls back to the browser voice only if none arrives. Returns a stop function. */
function speak(text: string, onEnd: () => void) {
  const controller = new AbortController()
  const context = new AudioContext()
  let playAt = 0
  let last: AudioBufferSourceNode | null = null
  let ended = false
  const finish = () => { if (!ended) { ended = true; onEnd() } }
  const play = (base64: string) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const pcm = new Int16Array(bytes.buffer, 0, bytes.byteLength >> 1)
    if (!pcm.length) return
    const buffer = context.createBuffer(1, pcm.length, 24_000)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    playAt = Math.max(context.currentTime + 0.02, playAt)
    source.start(playAt)
    playAt += buffer.duration
    last = source
  }
  void (async () => {
    const response = await fetch('/api/voice/say', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: controller.signal })
    if (!response.ok || !response.body) throw new Error('The local voice is unavailable.')
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
    let pending = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const blocks = (pending + value).split('\n\n')
      pending = blocks.pop() || ''
      for (const block of blocks) {
        const data = block.split('\n').find(line => line.startsWith('data: '))?.slice(6)
        if (!data || data === '[DONE]') continue
        const event = JSON.parse(data) as { type?: string; audio?: string }
        if (event.type === 'speech.audio.delta' && event.audio) play(event.audio)
      }
    }
    if (!last) throw new Error('No speech came back.')
    ;(last as AudioBufferSourceNode).onended = finish
  })().catch(() => { if (!controller.signal.aborted && !last) speakInBrowser(text, finish); else if (!controller.signal.aborted) finish() })
  return () => { ended = true; controller.abort(); speechSynthesis.cancel(); void context.close() }
}

/** Decodes a recording to 16 kHz mono Float32 PCM and transcribes it with the local Whisper host. */
async function transcribe(blob: Blob) {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE })
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer())
    const pcm = audio.getChannelData(0).slice(0, MAX_SECONDS * SAMPLE_RATE)
    const result = await readApiJson<{ text?: string }>(fetch('/api/source/transcribe', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Blob([pcm]) }), 'Local transcription')
    return typeof result.text === 'string' ? result.text.trim() : ''
  } finally {
    void context.close()
  }
}

/** The spoken diagnostic, shown while checkpoint 1 is planned. The tutor speaks; the learner answers by voice. The meter shows the AIMD language level. */
export function DiagnosticChat({ title, turns, busy, done, level, planReady, error, onAnswer, onClose }: Props) {
  const [phase, setPhase] = useState<'idle' | 'speaking' | 'listening' | 'transcribing'>('idle')
  const [micError, setMicError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stopSpeech = useRef<(() => void) | null>(null)
  const stopRequested = useRef(false)
  const lastTutor = [...turns].reverse().find(turn => turn.role === 'tutor')?.text || ''

  // Speak each new tutor question aloud.
  useEffect(() => {
    if (!lastTutor || busy) return
    setPhase('speaking')
    const stop = speak(lastTutor, () => setPhase(current => current === 'speaking' ? 'idle' : current))
    stopSpeech.current = stop
    return stop
  }, [lastTutor, busy])

  useEffect(() => () => recorder.current?.stream.getTracks().forEach(track => track.stop()), [])

  const canTalk = !busy && !done && phase !== 'transcribing'
  const latest = useRef({ canTalk, startListening, stopListening })
  latest.current = { canTalk, startListening, stopListening }

  // Hold Space to answer, like the lesson's push-to-talk. Capture phase so tldraw and the lesson dock never see it.
  useEffect(() => {
    let held = false
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || typing(e.target) || !latest.current.canTalk) return
      e.preventDefault(); e.stopImmediatePropagation()
      if (e.repeat || held) return
      held = true
      void latest.current.startListening()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !held) return
      e.preventDefault(); e.stopImmediatePropagation()
      held = false
      latest.current.stopListening()
    }
    const blur = () => { if (held) { held = false; latest.current.stopListening() } }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur) }
  }, [])

  function stopListening() {
    stopRequested.current = true
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  async function startListening() {
    if (recorder.current) return
    stopSpeech.current?.()
    stopRequested.current = false
    setMicError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const chunks: Blob[] = []
      const next = new MediaRecorder(stream)
      next.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      next.onstop = async () => {
        stream.getTracks().forEach(track => track.stop())
        recorder.current = null
        setPhase('transcribing')
        try {
          const text = await transcribe(new Blob(chunks, { type: next.mimeType }))
          if (text) onAnswer(text)
          else setMicError('I didn’t catch that. Hold Space or tap the mic and try again.')
        } catch (reason) {
          setMicError(reason instanceof Error ? reason.message : 'Transcription failed.')
        }
        setPhase('idle')
      }
      recorder.current = next
      next.start()
      setPhase('listening')
      if (stopRequested.current) next.stop() // Space was released before the mic opened
      setTimeout(() => { if (recorder.current === next && next.state === 'recording') next.stop() }, MAX_SECONDS * 1000)
    } catch (reason) {
      setMicError(microphoneErrorMessage(reason) || 'Allow microphone access to answer by voice.')
      setPhase('idle')
    }
  }

  const position = ((level - AIMD.min) / (AIMD.max - AIMD.min)) * 100
  const status = busy ? 'Thinking…' : phase === 'speaking' ? 'Speaking…' : phase === 'listening' ? 'Listening… let go of Space (or tap) when you’re done' : phase === 'transcribing' ? 'Catching that…' : 'Hold Space or tap the mic to answer'

  return (
    <section className="diagnostic-chat" aria-label="Getting to know where you are starting">
      <header className="diagnostic-head">
        <div>
          <p className="diagnostic-kicker">Before your lesson</p>
          <h2>{title}</h2>
        </div>
        <button type="button" className="diagnostic-skip" onClick={onClose}>{done ? 'Close' : 'Skip'}</button>
      </header>

      <div className="diagnostic-meter" aria-label={`Explaining at level ${level} of 10: ${levelLabel(level)}`}>
        <span>Everyday</span>
        <div className="diagnostic-meter-track"><i style={{ left: `${position}%` }} /></div>
        <span>Technical</span>
        <b>{levelLabel(level)}</b>
      </div>

      {done ? (
        <div className="diagnostic-done">
          <p>Thanks, that gives me a good starting point. I'll explain at the “{levelLabel(level)}” level and adjust as we go.</p>
          <button type="button" className="diagnostic-primary" onClick={onClose} disabled={!planReady}>{planReady ? 'Start the lesson' : 'Finishing your first checkpoint…'}</button>
        </div>
      ) : (
        <div className="diagnostic-voice">
          {/* The spoken question as a caption, for anyone who can't hear it. */}
          <p className="diagnostic-caption" aria-live="polite">{busy ? '' : lastTutor}</p>
          <button type="button" className={`diagnostic-mic ${phase === 'listening' ? 'is-listening' : ''}`} disabled={busy || phase === 'transcribing'}
            aria-label={phase === 'listening' ? 'Stop and send your answer' : 'Answer by voice (or hold the Space bar)'}
            onClick={() => phase === 'listening' ? stopListening() : void startListening()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" /></svg>
          </button>
          <p className="diagnostic-status">{status}</p>
        </div>
      )}

      {(error || micError) && <p className="diagnostic-error" role="alert">{error || micError}</p>}
    </section>
  )
}
