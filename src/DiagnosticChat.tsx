import { useEffect, useRef, useState } from 'react'
import { AIMD, levelLabel } from './aimd'
import type { DiagnosticTurn } from './learning'
import { microphoneErrorMessage } from './micAccess'
import { DiagnosticVoice } from './diagnosticVoice'
import { Button } from './components/ui/button'
import './diagnostic.css'

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
  onStart: () => void
}

const MAX_SECONDS = 28

export function DiagnosticChat({ title, turns, busy, done, level, planReady, error, onAnswer, onClose, onStart }: Props) {
  const [phase, setPhase] = useState<'idle' | 'speaking' | 'connecting' | 'listening' | 'transcribing'>('idle')
  const [micError, setMicError] = useState('')
  const voice = useRef<DiagnosticVoice | null>(null)
  const answer = useRef(onAnswer)
  const stopRequested = useRef(false)
  const timer = useRef<number | null>(null)
  answer.current = onAnswer
  const lastTutor = [...turns].reverse().find(turn => turn.role === 'tutor')?.text || ''

  useEffect(() => {
    voice.current = new DiagnosticVoice(text => {
      if (text) answer.current(text)
      else setMicError('I didn’t catch that. Hold Space or tap the mic and try again.')
      setPhase('idle')
    }, message => { setMicError(message); setPhase('idle') })
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      voice.current?.close()
      voice.current = null
    }
  }, [])

  useEffect(() => {
    if (!lastTutor || busy || done) return
    setPhase('speaking')
    void voice.current?.speak(lastTutor, () => setPhase(current => current === 'speaking' ? 'idle' : current)).catch(reason => {
      setMicError(microphoneErrorMessage(reason) || (reason instanceof Error ? reason.message : 'Local voice is unavailable.'))
      setPhase('idle')
    })
    return () => voice.current?.cancelSpeech()
  }, [lastTutor, busy, done])

  const canTalk = !busy && !done && phase !== 'transcribing'
  const latest = useRef({ canTalk, startListening, stopListening })
  latest.current = { canTalk, startListening, stopListening }

  useEffect(() => {
    let held = false
    const typing = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || typing(event.target) || !latest.current.canTalk) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat || held) return
      held = true
      void latest.current.startListening()
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || !held) return
      event.preventDefault(); event.stopImmediatePropagation()
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
    if (timer.current !== null) window.clearTimeout(timer.current)
    try {
      if (voice.current?.stop()) setPhase('transcribing')
      else if (phase === 'connecting') setPhase('idle')
    } catch (reason) { setMicError(reason instanceof Error ? reason.message : 'Transcription failed.'); setPhase('idle') }
  }

  async function startListening() {
    if (phase === 'connecting' || phase === 'listening' || phase === 'transcribing') return
    voice.current?.cancelSpeech()
    stopRequested.current = false
    setMicError('')
    setPhase('connecting')
    try {
      await voice.current?.connect()
      if (stopRequested.current) return
      await voice.current?.start()
      setPhase('listening')
      if (stopRequested.current) stopListening()
      else timer.current = window.setTimeout(() => stopListening(), MAX_SECONDS * 1000)
    } catch (reason) {
      setMicError(microphoneErrorMessage(reason) || (reason instanceof Error ? reason.message : 'Allow microphone access to answer by voice.'))
      setPhase('idle')
    }
  }

  const position = ((level - AIMD.min) / (AIMD.max - AIMD.min)) * 100
  const status = busy ? 'Thinking…' : phase === 'speaking' ? 'Speaking…' : phase === 'connecting' ? 'Connecting microphone…' : phase === 'listening' ? 'Listening… let go of Space (or tap) when you’re done' : phase === 'transcribing' ? 'Catching that…' : 'Hold Space or tap the mic to answer'

  return (
    <section className="diagnostic-chat" aria-label="Getting to know where you are starting">
      <header className="diagnostic-head">
        <div>
          <p className="diagnostic-kicker">Before your lesson</p>
          <h2>{title}</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" className="diagnostic-skip" onClick={onClose}>{done ? 'Close' : 'Skip'}</Button>
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
          <Button type="button" className="diagnostic-primary" onClick={onStart} disabled={!planReady}>{planReady ? 'Start the lesson' : 'Finishing your first checkpoint…'}</Button>
        </div>
      ) : (
        <div className="diagnostic-voice">
          <p className="diagnostic-caption" aria-live="polite">{busy ? '' : lastTutor}</p>
          <Button type="button" size="icon-lg" className={`diagnostic-mic ${phase === 'listening' ? 'is-listening' : ''}`} disabled={busy || phase === 'transcribing'}
            aria-label={phase === 'listening' || phase === 'connecting' ? 'Stop and send your answer' : 'Answer by voice (or hold the Space bar)'}
            onClick={() => phase === 'listening' || phase === 'connecting' ? stopListening() : void startListening()}>
            <svg className="diagnostic-mic-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" /></svg>
          </Button>
          <p className="diagnostic-status" role="status">{status}</p>
        </div>
      )}

      {(error || micError) && <p className="diagnostic-error" role="alert">{error || micError}</p>}
    </section>
  )
}
