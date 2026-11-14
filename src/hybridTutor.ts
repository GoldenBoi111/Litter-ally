import { MicVAD } from '@ricky0123/vad-web'
import { formatCheckpointBrief, readTeachingBeat, type CheckpointBrief, type SelectionContext, type TeachingBeat, type TeachingExecutionState } from './lessonAgent'
import { canContinueAfterUnrecognizedInterruption, shouldInterruptOnSpeechStart } from './voice-turn.mjs'
import { checkApiResponse } from './storage'

export type TutorStatus = 'idle' | 'connecting' | 'listening' | 'speaking' | 'drawing' | 'paused' | 'stopped' | 'error'
type SpeechRequest = { resolve: (success: boolean) => void; started: number; turn: number; chunks: ArrayBuffer[] }

export type TutorCallbacks = {
  presentTeachingBeat: (beat: TeachingBeat) => Promise<TeachingExecutionState>
  drawDiagram: (diagramIndex: number, request?: string) => Promise<string>
  showSourcePage: (pageNumber: number) => Promise<{ message: string; imageUrl?: string; pageText?: string }>
  readSourcePage: (pageNumber: number) => string
  moveCheckpoint: (direction: 'next' | 'previous') => Promise<string>
  getSelection: () => SelectionContext | null
  getTeachingState: (beatId: string) => TeachingExecutionState
  onStatus: (status: TutorStatus, detail?: string) => void
  onTranscript: (lines: Array<{ role: 'Tutor' | 'You'; text: string }>) => void
  onInterrupt?: () => void
}

type InputItem = { type: 'message'; role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>>; [key: string]: unknown } |
  { type: 'function_call'; call_id: string; name: string; arguments: string } |
  { type: 'function_call_output'; call_id: string; output: string } |
  { type: 'reasoning'; [key: string]: unknown }

export class HybridTutor {
  private vad: MicVAD | null = null
  private micStream: MediaStream | null = null
  private peer: RTCPeerConnection | null = null
  private control: RTCDataChannel | null = null
  private readonly speechRequests = new Map<string, SpeechRequest>()
  private speechSequence = 0
  private audioContext: AudioContext | null = null
  /** Boost + limiter in front of the speakers: local TTS comes out around -21 dBFS, which is hard to hear next to an open mic. */
  private speechOutput: AudioNode | null = null
  private readonly sources = new Set<AudioBufferSourceNode>()
  private readonly ttsControllers = new Set<AbortController>()
  private input: InputItem[] = []
  private title = ''
  private brief: CheckpointBrief | null = null
  private turnId = 0
  private playbackAt = 0
  private paused = false
  private micMuted = true
  private speechOpen = false
  private pendingTranscriptions = 0
  private pushToTalkRequest = 0
  private closed = true
  private transcripts: Array<{ role: 'Tutor' | 'You'; text: string }> = []
  private speechQueue: Promise<unknown> = Promise.resolve()
  private lastSpeechFrameAt = 0
  private speechEndedAt = 0
  private interruptionAt = 0
  private interruptionSources = 0
  private responseStartedAt = 0
  private firstTextRecorded = false
  private firstPhraseRecorded = false
  private firstAudioRecorded = false
  private assistantBusy = false
  private pendingResponse = false
  private queuedTeachingBeats = 0
  private currentBeat: { id: string; spokenComplete: boolean; drawingComplete: boolean } | null = null
  private interruptedBeat: { id: string; spokenComplete: boolean; drawingComplete: boolean } | null = null
  private interruptedForInput = false
  private lastBeatEndedAt = 0
  private automaticBeatStreak = 0
  private readonly seenBeatIds = new Set<string>()
  private readonly streaming: boolean
  private readonly bargeIn: boolean
  private readonly rtcUrl: string
  private readonly iceServers: RTCIceServer[]
  /** True when the local WebRTC voice host is unreachable and we fall back to the browser's own speech APIs. */
  private browserVoice = false
  private recognition: { start(): void; stop(): void; abort(): void; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean } | null = null
  private recognized = ''
  /** Set when the learner cut the tutor off to ask something: answer, then pick the lesson back up. */
  private resumeAfterAnswer = false
  /** Speech started early (from streamed tool arguments) keyed by beatId, so the beat doesn't speak it twice. */
  private earlySpeech = new Map<string, Promise<boolean>>()

  constructor(private callbacks: TutorCallbacks, private preparedAudioContext?: AudioContext, options: { streaming?: boolean; bargeIn?: boolean; rtcUrl?: string; iceServers?: RTCIceServer[] } = {}) {
    this.streaming = options.streaming !== false
    this.bargeIn = options.bargeIn !== false
    this.rtcUrl = options.rtcUrl || 'http://127.0.0.1:8190'
    this.iceServers = options.iceServers || []
  }

  async connect(paperTitle: string, brief: CheckpointBrief) {
    this.close()
    this.closed = false
    this.paused = false
    this.micMuted = true
    this.speechOpen = false
    this.pendingTranscriptions = 0
    this.title = paperTitle
    this.brief = brief
    this.input = []
    this.transcripts = []
    this.seenBeatIds.clear()
    this.currentBeat = null
    this.interruptedBeat = null
    this.queuedTeachingBeats = 0
    this.lastBeatEndedAt = 0
    this.automaticBeatStreak = 0
    this.callbacks.onStatus('connecting', 'Loading local speech detection and requesting microphone access…')
    this.audioContext = this.preparedAudioContext || new AudioContext()
    this.speechOutput = createSpeechOutput(this.audioContext)
    void this.audioContext.resume()
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    if (this.closed) { for (const track of micStream.getTracks()) track.stop(); return }
    this.micStream = micStream
    this.browserVoice = false
    try {
      await this.connectRtc(micStream)
    } catch (error) {
      if (!browserSpeechAvailable()) throw error
      // No local voice host (e.g. on a Mac without the Windows voice stack): speak and listen with the browser instead.
      this.browserVoice = true
      for (const track of micStream.getTracks()) track.stop()
      this.micStream = null
    }
    if (this.closed) return
    if (!this.browserVoice) this.vad = await MicVAD.new({
      model: 'v5',
      baseAssetPath: `${import.meta.env.DEV ? '/api/voice/assets' : `${import.meta.env.BASE_URL}voice-assets`}/vad/`,
      onnxWASMBasePath: `${import.meta.env.DEV ? '/api/voice/assets' : `${import.meta.env.BASE_URL}voice-assets`}/ort/`,
      getStream: async () => this.micStream!,
      pauseStream: async stream => { for (const track of stream.getAudioTracks()) track.enabled = false },
      resumeStream: async stream => {
        for (const track of stream.getAudioTracks()) track.enabled = true
        return stream
      },
      positiveSpeechThreshold: 0.58,
      negativeSpeechThreshold: 0.42,
      redemptionMs: 450,
      minSpeechMs: 200,
      preSpeechPadMs: 300,
      onSpeechRealStart: () => {
        if (this.micMuted || this.paused) return
        this.speechOpen = true
        if (shouldInterruptOnSpeechStart(this.bargeIn, this.isBusy())) {
          this.interruptedForInput = true
          this.interrupt()
        }
        this.sendControl({ type: 'speech.start', turn: this.turnId })
      },
      onFrameProcessed: probabilities => {
        if (probabilities.isSpeech >= 0.58) this.lastSpeechFrameAt = performance.now()
      },
      onSpeechEnd: audio => {
        if (!this.speechOpen) return
        this.speechOpen = false
        this.speechEndedAt = performance.now()
        if (this.lastSpeechFrameAt) recordMetric('vadEndpointMs', this.speechEndedAt - this.lastSpeechFrameAt)
        this.lastSpeechFrameAt = 0
        this.endSpeech(audio)
      },
    })
    if (this.closed) { await this.vad?.destroy(); return }
    if (this.closed || (!this.vad && !this.browserVoice)) return
    await this.vad?.pause()
    this.callbacks.onStatus('listening', this.browserVoice ? 'Local voice host not running, so using your browser\'s voice. Hold the mic to talk.' : 'Hold the microphone button to speak; release to send.')
    this.input.push({ type: 'message', role: 'user', content: `Begin checkpoint “${brief.checkpoint.title}”. Follow the checkpoint brief, show the first cited page, and start teaching its specific focus right away without asking me anything first.` })
    void this.respond()
  }

  ask(message: string) {
    if (!this.closed && message.trim()) {
      this.interrupt()
      this.interruptedForInput = false
      this.appendInterruptedState()
      const text = message.trim()
      this.transcripts = [...this.transcripts, { role: 'You' as const, text }].slice(-8)
      this.callbacks.onTranscript(this.transcripts)
      this.input.push({ type: 'message', role: 'user', content: text })
      void this.respond()
    }
  }

  updateCheckpointBrief(brief: CheckpointBrief) {
    if (!this.closed && !this.paused) {
      this.brief = brief
      this.input.push({ type: 'message', role: 'user', content: `Updated learner context for the current checkpoint:\n${formatCheckpointBrief(brief)}` })
    }
  }

  askAboutSelection(imageUrl?: string) {
    if (this.closed) return
    this.interrupt()
    this.interruptedForInput = false
    this.appendInterruptedState()
    this.input.push({
      type: 'message', role: 'user', content: imageUrl
        ? [{ type: 'input_text', text: 'Explain what I selected or circled, why it is drawn this way, and how it connects to the current checkpoint. Inspect the canvas selection before answering.' }, { type: 'input_image', image_url: imageUrl }]
        : 'Explain what I selected or circled and inspect the canvas selection before answering.',
    })
    void this.respond()
  }

  pause() {
    this.paused = true
    this.micMuted = true
    this.speechOpen = false
    for (const track of this.micStream?.getAudioTracks() || []) track.enabled = false
    this.interrupt()
    this.sendControl({ type: 'speech.cancel' })
    void this.vad?.pause()
    this.callbacks.onStatus('paused')
  }

  async setMicMuted(muted: boolean) {
    if (this.closed || this.paused || this.micMuted === muted) return !this.closed && !this.paused
    if (this.browserVoice) return this.setBrowserMic(muted)
    if (muted) {
      this.micMuted = true
      const request = ++this.pushToTalkRequest
      for (const track of this.micStream?.getAudioTracks() || []) track.enabled = false
      const hadOpenSpeech = this.speechOpen
      if (hadOpenSpeech) this.finishSpeech()
      else if (!this.pendingTranscriptions) this.continueAfterUnrecognizedInterruption()
      await this.vad?.pause()
      if (request !== this.pushToTalkRequest) {
        if (!this.closed && !this.paused && !this.micMuted) await this.vad?.start()
        return false
      }
      if (!hadOpenSpeech && !this.pendingTranscriptions && !this.interruptedForInput && !this.isBusy()) this.callbacks.onStatus('listening', 'Hold the microphone button to speak; release to send.')
      return true
    }
    const request = ++this.pushToTalkRequest
    this.micMuted = false
    this.cutInForLearner()
    try {
      await this.vad?.start()
      if (this.closed || this.paused || this.micMuted) {
        await this.vad?.pause()
        return false
      }
      if (request !== this.pushToTalkRequest) { await this.vad?.start(); return true }
      this.callbacks.onStatus('listening', 'Listening while held. Release to send.')
      return true
    } catch (error) {
      if (request !== this.pushToTalkRequest) return !this.micMuted
      this.micMuted = true
      this.callbacks.onStatus('error', error instanceof Error ? error.message : 'Could not start push-to-talk. Check microphone permission and try again.')
      return false
    }
  }

  resume(brief: CheckpointBrief) {
    if (!this.vad || this.closed) return
    this.paused = false
    this.brief = brief
    this.callbacks.onStatus('listening')
    if (!this.micMuted) void this.vad.start()
    this.appendInterruptedState()
    this.input.push({ type: 'message', role: 'user', content: `Resume from the current canvas state and follow this checkpoint brief:\n${formatCheckpointBrief(brief)}` })
    void this.respond()
  }

  /** Pressing to talk stops the tutor immediately (not after voice detection kicks in). */
  private cutInForLearner() {
    if (!this.isBusy() && !this.currentBeat) return
    this.interruptedForInput = true
    this.resumeAfterAnswer = true
    this.interrupt()
    this.sendControl({ type: 'speech.cancel' })
  }

  private setBrowserMic(muted: boolean) {
    this.micMuted = muted
    if (muted) {
      this.recognition?.stop()
      return true
    }
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) { this.micMuted = true; this.callbacks.onStatus('error', 'This browser has no speech recognition. Type your question instead.'); return false }
    this.cutInForLearner()
    const recognition = new Ctor()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.continuous = true
    this.recognized = ''
    const turn = this.turnId
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) this.recognized += ` ${event.results[i][0].transcript}`
    }
    recognition.onerror = (event: any) => { if (event.error !== 'aborted' && event.error !== 'no-speech') this.callbacks.onStatus('error', `Speech recognition failed: ${event.error}`) }
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null
      const text = this.recognized.trim()
      this.recognized = ''
      if (this.closed || this.paused) return
      if (text) this.acceptTranscript(text, turn === this.turnId ? turn : this.turnId)
      else if (this.interruptedForInput) this.continueAfterUnrecognizedInterruption()
      else this.callbacks.onStatus('listening')
    }
    this.recognition = recognition
    try { recognition.start() } catch { /* already started */ }
    this.callbacks.onStatus('listening', 'Listening while held. Release to send.')
    return true
  }

  close() {
    this.recognition?.abort()
    this.recognition = null
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    this.closed = true
    this.paused = false
    this.pendingResponse = false
    this.interrupt()
    void this.vad?.destroy()
    this.vad = null
    for (const track of this.micStream?.getTracks() || []) track.stop()
    this.micStream = null
    this.peer?.close()
    this.peer = null
    this.control = null
    for (const request of this.speechRequests.values()) request.resolve(false)
    this.speechRequests.clear()
    void this.audioContext?.close()
    this.audioContext = null
    this.speechOutput = null
  }

  private interrupt() {
    this.earlySpeech.clear()
    if (this.browserVoice && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    const interruptedAt = performance.now()
    const wasPlaying = this.sources.size > 0 || this.ttsControllers.size > 0
    this.interruptionAt = wasPlaying ? interruptedAt : 0
    this.interruptionSources = this.sources.size
    if (this.currentBeat && (!this.currentBeat.spokenComplete || !this.currentBeat.drawingComplete)) this.interruptedBeat = { ...this.currentBeat }
    this.turnId += 1
    this.pendingTranscriptions = 0
    this.assistantBusy = false
    this.pendingResponse = false
    this.callbacks.onInterrupt?.()
    this.responseController?.abort()
    this.responseController = null
    this.sendControl({ type: 'cancel' })
    for (const controller of this.ttsControllers) controller.abort()
    this.ttsControllers.clear()
    for (const source of this.sources) {
      try { source.stop() } catch { /* a finished source cannot be stopped again */ }
    }
    this.sources.clear()
    this.playbackAt = this.audioContext?.currentTime || 0
    this.speechQueue = Promise.resolve()
    this.queuedTeachingBeats = 0
    this.currentBeat = null
    this.automaticBeatStreak = 0
    if (wasPlaying && !this.interruptionSources) {
      recordMetric('interruptionToSilenceMs', performance.now() - interruptedAt)
      this.interruptionAt = 0
    }
    if (!this.closed && !this.paused) this.callbacks.onStatus('listening')
  }

  private appendInterruptedState() {
    if (!this.interruptedBeat) return
    const beat = this.interruptedBeat
    const drawing = this.callbacks.getTeachingState(beat.id)
    this.input.push({ type: 'message', role: 'user', content: `Execution state after interruption: beat ${beat.id}; spokenComplete=${beat.spokenComplete}; drawing=${JSON.stringify(drawing.actions)}. Preserve completed work, continue partial actions by stable id when useful, and rephrase briefly if the spoken explanation was cut off.` })
    this.interruptedBeat = null
  }

  private continueAfterUnrecognizedInterruption() {
    if (!canContinueAfterUnrecognizedInterruption(this.interruptedForInput, this.closed, this.paused)) return
    this.interruptedForInput = false
    this.resumeAfterAnswer = false
    this.appendInterruptedState()
    this.input.push({ type: 'message', role: 'user', content: 'The interruption was not understood. Continue the lesson from the current canvas state, briefly rephrasing any cut-off explanation.' })
    void this.respond()
  }

  private responseController: AbortController | null = null

  private async connectRtc(stream: MediaStream) {
    const peer = new RTCPeerConnection({ iceServers: this.iceServers })
    this.peer = peer
    const channel = peer.createDataChannel('voice-control')
    this.control = channel
    channel.binaryType = 'arraybuffer'
    channel.onmessage = event => this.onVoiceMessage(event.data)
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        for (const request of this.speechRequests.values()) request.resolve(false)
        this.speechRequests.clear()
        this.callbacks.onStatus('error', 'The local voice connection was lost. Stop and restart the tutor to reconnect.')
      }
    }
    for (const track of stream.getAudioTracks()) peer.addTrack(track, stream)
    try {
      await peer.setLocalDescription(await peer.createOffer())
      await waitForIce(peer)
      const local = peer.localDescription
      if (!local) throw new Error('WebRTC could not create a local offer.')
      const offerUrl = new URL(`${this.rtcUrl.replace(/\/$/, '')}/offer`)
      const offerRequest: RequestInit & { targetAddressSpace?: 'loopback' | 'local' } = {
        method: 'POST', signal: AbortSignal.timeout(20_000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sdp: local.sdp, type: local.type }),
      }
      if (['localhost', '127.0.0.1', '[::1]'].includes(offerUrl.hostname)) offerRequest.targetAddressSpace = 'loopback'
      const response = await fetch(offerUrl, offerRequest)
      const answer = await response.json().catch(() => ({})) as RTCSessionDescriptionInit & { error?: string }
      if (!response.ok || !answer.sdp || !answer.type) throw new Error(answer.error || `Local voice host returned HTTP ${response.status}.`)
      await peer.setRemoteDescription(answer)
      await waitForDataChannel(channel)
    } catch (error) {
      peer.close()
      if (this.peer === peer) this.peer = null
      if (this.control === channel) this.control = null
      if (error instanceof TypeError) throw new Error(`Could not reach the local voice host at ${this.rtcUrl}. Check its URL, CORS origins, and that the service is running.`)
      throw error
    }
  }

  private sendControl(message: Record<string, unknown>) {
    if (this.control?.readyState !== 'open') return false
    try { this.control.send(JSON.stringify(message)); return true }
    catch { return false }
  }

  private onVoiceMessage(data: string | ArrayBuffer) {
    if (data instanceof ArrayBuffer) {
      if (data.byteLength <= 4) return
      const id = String(new DataView(data).getUint32(0))
      const request = this.speechRequests.get(id)
      if (!request || request.turn !== this.turnId) return
      if (!this.firstAudioRecorded) {
        this.firstAudioRecorded = true
        recordMetric('ttsTimeToFirstAudioMs', performance.now() - request.started)
        if (this.speechEndedAt) recordMetric('speechToFirstAudioMs', performance.now() - this.speechEndedAt)
      }
      const pcm = data.slice(4)
      if (this.streaming) this.playPcm(pcm)
      else request.chunks.push(pcm)
      return
    }
    let message: { type?: string; text?: string; turn?: number; id?: string; error?: string; latencyMs?: number }
    try { message = JSON.parse(data) as typeof message }
    catch { this.callbacks.onStatus('error', 'The local voice host sent an invalid message.'); return }
    if (message.type === 'transcript') {
      const turn = message.turn
      if (turn !== this.turnId || this.closed || this.paused) return
      this.pendingTranscriptions = Math.max(0, this.pendingTranscriptions - 1)
      if (message.latencyMs) recordMetric('localSttLatencyMs', message.latencyMs)
      const text = typeof message.text === 'string' ? message.text.trim() : ''
      if (!text) {
        if (this.interruptedForInput) this.continueAfterUnrecognizedInterruption()
        else this.callbacks.onStatus('listening')
      } else this.acceptTranscript(text, turn)
    } else if (message.type === 'speech.done' && message.id) {
      const request = this.speechRequests.get(message.id)
      if (request && !this.streaming && request.turn === this.turnId) for (const chunk of request.chunks) this.playPcm(chunk)
      request?.resolve(true)
    } else if (message.type === 'error') {
      const request = message.id ? this.speechRequests.get(message.id) : undefined
      if (message.id && (!request || request.turn !== this.turnId)) return
      if (message.turn !== undefined && message.turn !== this.turnId) return
      if (!request) this.pendingTranscriptions = Math.max(0, this.pendingTranscriptions - 1)
      this.callbacks.onStatus('error', message.error || 'Local speech processing failed.')
      if (request) request.resolve(false)
      else this.continueAfterUnrecognizedInterruption()
    }
  }

  private endSpeech(audio: Float32Array) {
    if (this.closed || this.paused) return
    const turn = this.turnId
    if (this.micMuted || audio.length < 1600) {
      this.sendControl({ type: 'speech.end', turn, ignoreResult: true })
      if (this.interruptedForInput) this.continueAfterUnrecognizedInterruption()
      return
    }
    this.callbacks.onStatus('connecting', 'Transcribing locally…')
    const prompt = `${this.title}. ${this.brief ? formatCheckpointBrief(this.brief) : ''}`.slice(0, 2_000)
    if (this.sendControl({ type: 'speech.end', turn, prompt })) this.pendingTranscriptions += 1
    else {
      this.callbacks.onStatus('error', 'The local voice connection was lost. Stop and restart the tutor to reconnect.')
      this.continueAfterUnrecognizedInterruption()
    }
  }

  private finishSpeech() {
    if (!this.speechOpen || this.closed || this.paused) return
    this.speechOpen = false
    this.speechEndedAt = performance.now()
    this.callbacks.onStatus('connecting', 'Transcribing locally…')
    const prompt = `${this.title}. ${this.brief ? formatCheckpointBrief(this.brief) : ''}`.slice(0, 2_000)
    if (this.sendControl({ type: 'speech.end', turn: this.turnId, prompt })) this.pendingTranscriptions += 1
    else {
      this.callbacks.onStatus('error', 'The local voice connection was lost. Stop and restart the tutor to reconnect.')
      this.continueAfterUnrecognizedInterruption()
    }
  }

  private acceptTranscript(value: string, turn: number) {
    if (turn !== this.turnId || this.closed || this.paused) return
    const text = value.trim()
    if (!text) { this.callbacks.onStatus('listening'); return }
    this.interruptedForInput = false
    this.appendInterruptedState()
    this.transcripts = [...this.transcripts, { role: 'You' as const, text }].slice(-8)
    this.callbacks.onTranscript(this.transcripts)
    if (this.resumeAfterAnswer) {
      this.resumeAfterAnswer = false
      this.input.push({ type: 'message', role: 'user', content: `${text}\n\n(I cut you off mid-explanation to say this. Answer me directly and briefly first. Then say a short bridge like "Back to where we were" and continue the lesson from exactly where you stopped, finishing the interrupted explanation and its drawing by reusing the same beatId.)` })
    } else this.input.push({ type: 'message', role: 'user', content: text })
    if (this.isBusy()) this.pendingResponse = true
    else void this.respond()
  }

  private async respond() {
    if (!this.brief || this.closed || this.paused) return
    this.trimHistory()
    const turn = this.turnId
    const inputCount = this.input.length
    const requestInput = [...this.input]
    this.assistantBusy = true
    this.pendingResponse = false
    this.responseStartedAt = performance.now()
    this.firstTextRecorded = false
    this.firstPhraseRecorded = false
    this.firstAudioRecorded = false
    const controller = new AbortController()
    this.responseController = controller
    this.callbacks.onStatus('connecting', 'Thinking…')
    let accumulated = ''
    let phraseBuffer = ''
    const calls: Array<Extract<InputItem, { type: 'function_call' }>> = []
    let responseOutput: InputItem[] = []
    const toolResults: Array<{ output: string; context?: InputItem; continueAutomatically?: boolean }> = []
    let pendingTools = 0
    let toolTail = Promise.resolve()
    const streamingBeats = new Map<string, { args: string; started: boolean }>()
    try {
      const response = await fetch('/api/voice/respond', {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: this.title, brief: formatCheckpointBrief(this.brief), input: requestInput }),
      })
      await checkApiResponse(response, 'Tutor request')
      if (!response.body) throw new Error('Tutor request returned no response stream.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''
        for (const block of blocks) {
          const line = block.split('\n').find(item => item.startsWith('data: '))
          if (!line) continue
          const event = JSON.parse(line.slice(6)) as { type: string; id?: string; name?: string; delta?: string; text?: string; call?: Extract<InputItem, { type: 'function_call' }>; output?: InputItem[]; error?: string }
          if (event.type === 'text' && event.text) {
            if (!this.firstTextRecorded) {
              this.firstTextRecorded = true
              recordMetric('gptTimeToFirstTextMs', performance.now() - this.responseStartedAt)
            }
            accumulated += event.text
            phraseBuffer += event.text
            this.callbacks.onStatus('speaking')
            if (this.streaming && !pendingTools) {
              for (const phrase of takeSpeakablePhrases(() => phraseBuffer, value => { phraseBuffer = value })) {
                this.recordFirstPhrase()
                this.enqueueSpeech(phrase, turn)
              }
            }
          } else if (event.type === 'tool_start' && event.id) {
            if (event.name === 'present_teaching_beat') streamingBeats.set(event.id, { args: '', started: false })
          } else if (event.type === 'tool_delta' && event.id && event.delta) {
            const streaming = streamingBeats.get(event.id)
            if (streaming && !streaming.started) {
              streaming.args += event.delta
              const early = readEarlyBeatSpeech(streaming.args)
              // Speak as soon as the sentence is known, while the stroke data is still streaming.
              // Only when nothing else is queued, so spoken order always matches beat order.
              if (early && this.queuedTeachingBeats === 0 && !this.currentBeat && turn === this.turnId && !this.seenBeatIds.has(early.beatId)) {
                streaming.started = true
                this.seenBeatIds.add(early.beatId)
                this.transcripts = [...this.transcripts, { role: 'Tutor' as const, text: early.speech }].slice(-8)
                this.callbacks.onTranscript(this.transcripts)
                this.callbacks.onStatus('speaking')
                this.recordFirstPhrase()
                this.earlySpeech.set(early.beatId, this.speak(early.speech, turn))
              }
            }
          } else if (event.type === 'tool' && event.call) {
            const call = event.call
            calls.push(call)
            pendingTools += 1
            toolTail = toolTail.then(async () => {
              const result = await this.executeTool(call.name, call.arguments)
              toolResults.push(result)
              pendingTools -= 1
              if (!pendingTools && this.streaming && turn === this.turnId) {
                for (const phrase of takeSpeakablePhrases(() => phraseBuffer, value => { phraseBuffer = value })) {
                  this.recordFirstPhrase()
                  this.enqueueSpeech(phrase, turn)
                }
              }
            })
          }
          else if (event.type === 'output' && event.output) responseOutput = event.output
          else if (event.type === 'error') throw new Error(event.error || 'Tutor response failed.')
        }
        if (done) break
      }
      await toolTail
      if (turn !== this.turnId || this.closed) return
      if (this.responseController === controller) this.responseController = null
      if (this.streaming) {
        if (phraseBuffer.trim()) this.enqueueSpeech(phraseBuffer.trim(), turn)
      } else {
        phraseBuffer = accumulated
        while (phraseBuffer.length > 280) {
          const phrases = takeSpeakablePhrases(() => phraseBuffer, value => { phraseBuffer = value })
          if (!phrases.length) break
          for (const phrase of phrases) { this.recordFirstPhrase(); this.enqueueSpeech(phrase, turn) }
        }
        if (phraseBuffer.trim()) { this.recordFirstPhrase(); this.enqueueSpeech(phraseBuffer.trim(), turn) }
      }
      const responseItems: InputItem[] = responseOutput
      if (accumulated.trim()) {
        this.transcripts = [...this.transcripts, { role: 'Tutor' as const, text: accumulated.trim() }].slice(-8)
        this.callbacks.onTranscript(this.transcripts)
      }
      for (let index = 0; index < calls.length; index += 1) {
        responseItems.push({ type: 'function_call_output', call_id: calls[index].call_id, output: toolResults[index].output })
        const context = toolResults[index].context
        if (context) responseItems.push(context)
      }
      this.input.splice(inputCount, 0, ...responseItems)
      this.assistantBusy = false
      if (calls.length && toolResults.some(result => result.continueAutomatically !== false)) void this.respond()
      else void this.speechQueue.finally(() => {
        if (turn === this.turnId && !this.closed && !this.paused) this.callbacks.onStatus('listening')
        this.startPendingResponse()
      })
    } catch (error) {
      if (controller.signal.aborted || turn !== this.turnId || this.closed || this.responseController !== controller) return
      this.assistantBusy = false
      this.responseController = null
      this.callbacks.onStatus('error', error instanceof Error ? error.message : 'Tutor response failed.')
      this.callbacks.onStatus('listening')
      this.startPendingResponse()
    }
  }

  private enqueueSpeech(text: string, turn: number) {
    this.speechQueue = this.speechQueue.then(() => this.speak(text, turn))
  }

  private recordFirstPhrase() {
    if (this.firstPhraseRecorded) return
    this.firstPhraseRecorded = true
    recordMetric('gptTimeToFirstSpeakablePhraseMs', performance.now() - this.responseStartedAt)
  }

  private isBusy() {
    return this.assistantBusy || this.ttsControllers.size > 0 || this.sources.size > 0
  }

  private trimHistory() {
    while (this.input.length > 80) {
      const nextTurn = this.input.findIndex((item, index) => index > 0 && item.type === 'message' && item.role === 'user')
      if (nextTurn < 0) return
      this.input.splice(0, nextTurn)
      const retainedCalls = new Set(this.input.filter((item): item is Extract<InputItem, { type: 'function_call' }> => item.type === 'function_call').map(item => item.call_id))
      this.input = this.input.filter(item => item.type !== 'function_call_output' || retainedCalls.has(item.call_id))
    }
  }

  private startPendingResponse() {
    if (this.pendingResponse && !this.isBusy() && !this.closed && !this.paused) {
      this.pendingResponse = false
      void this.respond()
    }
  }

  private async speak(text: string, turn: number) {
    if (!text.trim() || text.length > 900 || turn !== this.turnId || this.closed) return false
    if (this.browserVoice) return this.speakInBrowser(text, turn)
    const controller = new AbortController()
    this.ttsControllers.add(controller)
    const id = String(++this.speechSequence)
    try {
      const succeeded = await new Promise<boolean>(resolve => {
        this.speechRequests.set(id, { resolve, started: performance.now(), turn, chunks: [] })
        controller.signal.addEventListener('abort', () => {
          this.speechRequests.delete(id)
          resolve(false)
        }, { once: true })
        if (!this.control || this.control.readyState !== 'open') resolve(false)
        else if (!this.sendControl({ type: 'speak', id, text })) resolve(false)
      })
      return succeeded && turn === this.turnId && !controller.signal.aborted
    } catch (error) {
      if (!controller.signal.aborted && turn === this.turnId && !this.closed) this.callbacks.onStatus('error', error instanceof Error ? error.message : 'Local speech generation failed.')
    } finally {
      this.speechRequests.delete(id)
      this.ttsControllers.delete(controller)
      this.startPendingResponse()
    }
    return false
  }

  private speakInBrowser(text: string, turn: number) {
    return new Promise<boolean>(resolve => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.03
      utterance.volume = 1
      const voice = speechSynthesis.getVoices().find(v => /en(-|_)/i.test(v.lang) && /natural|premium|enhanced|samantha|daniel/i.test(v.name)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang))
      if (voice) utterance.voice = voice
      this.callbacks.onStatus('speaking')
      utterance.onend = () => { this.startPendingResponse(); resolve(turn === this.turnId && !this.closed) }
      utterance.onerror = () => { this.startPendingResponse(); resolve(false) }
      speechSynthesis.speak(utterance)
    })
  }

  private playPcm(input: string | ArrayBuffer) {
    if (!this.audioContext) return
    let pcm: Int16Array
    if (typeof input === 'string') {
      const binary = atob(input)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2))
    } else pcm = new Int16Array(input, 0, Math.floor(input.byteLength / 2))
    if (!pcm.length) return
    const buffer = this.audioContext.createBuffer(1, pcm.length, 24000)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768
    const source = this.audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(this.speechOutput || this.audioContext.destination)
    if (!this.sources.size && this.playbackAt > 0 && this.audioContext.currentTime - this.playbackAt > 0.04) recordMetric('audioUnderruns', 1)
    const start = Math.max(this.audioContext.currentTime + 0.015, this.playbackAt)
    this.playbackAt = start + buffer.duration
    this.sources.add(source)
    source.onended = () => {
      this.sources.delete(source)
      if (this.interruptionAt && --this.interruptionSources === 0) {
        recordMetric('interruptionToSilenceMs', performance.now() - this.interruptionAt)
        this.interruptionAt = 0
      }
      this.startPendingResponse()
    }
    source.start(start)
  }

  private async queueTeachingBeat(beat: TeachingBeat, turn: number) {
    if (this.queuedTeachingBeats >= 2) await this.speechQueue
    if (turn !== this.turnId || this.closed || this.paused) return
    this.queuedTeachingBeats += 1
    const run = async () => {
      if (turn !== this.turnId || this.closed || this.paused) return
      if (this.lastBeatEndedAt) recordMetric('beatTransitionMs', performance.now() - this.lastBeatEndedAt)
      this.currentBeat = { id: beat.beatId, spokenComplete: false, drawingComplete: false }
      if (!this.seenBeatIds.has(beat.beatId)) {
        this.seenBeatIds.add(beat.beatId)
        this.transcripts = [...this.transcripts, { role: 'Tutor' as const, text: beat.speech }].slice(-8)
        this.callbacks.onTranscript(this.transcripts)
      }
      this.callbacks.onStatus('speaking', beat.context)
      const drawing = this.callbacks.presentTeachingBeat(beat).then(result => {
        if (this.currentBeat?.id === beat.beatId) this.currentBeat.drawingComplete = result.actions.every(action => action.state === 'complete')
        return result
      })
      const early = this.earlySpeech.get(beat.beatId)
      this.earlySpeech.delete(beat.beatId)
      const spoken = (early ?? this.speak(beat.speech, turn)).then(async complete => {
        await this.waitForPlayback(turn)
        if (this.currentBeat?.id === beat.beatId) this.currentBeat.spokenComplete = complete && turn === this.turnId
      })
      await Promise.all([drawing, spoken])
      if (turn !== this.turnId || this.closed || this.paused) return
      this.lastBeatEndedAt = performance.now()
      if (beat.pauseMs) await new Promise(resolve => window.setTimeout(resolve, beat.pauseMs))
      if (this.currentBeat?.id === beat.beatId) this.currentBeat = null
    }
    this.speechQueue = this.speechQueue.catch(() => undefined).then(run).catch(error => {
      if (turn === this.turnId && !this.closed) this.callbacks.onStatus('error', error instanceof Error ? error.message : 'Teaching beat failed.')
    }).finally(() => { this.queuedTeachingBeats = Math.max(0, this.queuedTeachingBeats - 1) })
  }

  private async waitForPlayback(turn: number) {
    while (turn === this.turnId && !this.closed && this.sources.size) await new Promise(resolve => window.setTimeout(resolve, 30))
  }

  private async executeTool(name: string, raw: string): Promise<{ output: string; context?: InputItem; continueAutomatically?: boolean }> {
    const args = JSON.parse(raw) as Record<string, unknown>
    let output = 'Unknown tool.'
    let context: InputItem | undefined
    let continueAutomatically = true
    this.callbacks.onStatus('drawing')
    if (name === 'present_teaching_beat') {
      const beat = readTeachingBeat(args)
      await this.queueTeachingBeat(beat, this.turnId)
      this.automaticBeatStreak = beat.waitForLearner ? 0 : this.automaticBeatStreak + 1
      continueAutomatically = !beat.waitForLearner && this.automaticBeatStreak < 3
      output = `Queued teaching beat ${beat.beatId}. Stable actions will resume instead of duplicating if interrupted.`
    } else if (name === 'show_source_page' && Number.isInteger(args.pageNumber)) {
      const result = await this.callbacks.showSourcePage(Number(args.pageNumber))
      output = result.pageText ? `${result.message}\n${result.pageText}` : result.message
      if (result.imageUrl) context = { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'The requested source location is shown on the canvas. Inspect it as evidence for the explanation.' }, { type: 'input_image', image_url: result.imageUrl }] }
    } else if (name === 'read_source_segment' && Number.isInteger(args.pageNumber)) {
      output = this.callbacks.readSourcePage(Number(args.pageNumber))
    } else if (name === 'draw_lesson_diagram' && Number.isInteger(args.diagramIndex)) {
      const request = typeof args.request === 'string' ? args.request.trim().slice(0, 600) : ''
      // Don't block the voice on diagram planning + drawing: start it and let the tutor keep talking while ink appears.
      const turn = this.turnId
      void this.callbacks.drawDiagram(Number(args.diagramIndex), request).then(result => {
        if (turn === this.turnId && !this.closed) this.input.push({ type: 'message', role: 'user', content: `(Board update, not from the learner: ${result})` })
      }).catch(error => {
        if (turn === this.turnId && !this.closed) this.input.push({ type: 'message', role: 'user', content: `(Board update, not from the learner: the diagram failed: ${error instanceof Error ? error.message : 'unknown error'}. Continue without it.)` })
      })
      output = 'The diagram has started drawing on the board and will appear stroke by stroke over the next half minute. Do not wait for it: start explaining right now with present_teaching_beat, walking through the idea in the order it is being drawn, and do not call draw_lesson_diagram again for it.'
    } else if (name === 'move_checkpoint' && (args.direction === 'next' || args.direction === 'previous')) {
      output = await this.callbacks.moveCheckpoint(args.direction)
    } else if (name === 'inspect_canvas_selection' && typeof args.question === 'string') {
      const selection = this.callbacks.getSelection()
      output = selection ? JSON.stringify({ question: args.question, ...selection }) : 'Nothing is selected. Ask the learner to select the shape or circle they want explained.'
    }
    return { output, context, continueAutomatically }
  }
}

/** Pull beatId and speech out of a partially streamed present_teaching_beat argument string, once both strings are complete. */
export function readEarlyBeatSpeech(partial: string): { beatId: string; speech: string } | null {
  const field = (name: string) => {
    const match = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(partial)
    if (!match) return null
    try { return JSON.parse(`"${match[1]}"`) as string } catch { return null }
  }
  const beatId = field('beatId'), speech = field('speech')
  return beatId && speech && speech.trim() ? { beatId, speech: speech.trim() } : null
}

/** Raises quiet TTS to a comfortable level (about +8 dB) and limits peaks so the boost never clips. */
export function createSpeechOutput(context: AudioContext): AudioNode {
  const gain = context.createGain()
  gain.gain.value = SPEECH_GAIN
  const limiter = context.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 4
  limiter.ratio.value = 12
  limiter.attack.value = 0.003
  limiter.release.value = 0.15
  gain.connect(limiter)
  limiter.connect(context.destination)
  return gain
}

const SPEECH_GAIN = 2.5

function browserSpeechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

function waitForIce(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(peer.localDescription?.sdp?.includes('a=candidate:')
      ? undefined
      : new Error('No WebRTC network candidates were found. Check local network access and the configured ICE servers.')), 4_000)
    const onChange = () => { if (peer.iceGatheringState === 'complete') finish() }
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      peer.removeEventListener('icegatheringstatechange', onChange)
      error ? reject(error) : resolve()
    }
    peer.addEventListener('icegatheringstatechange', onChange)
  })
}

function waitForDataChannel(channel: RTCDataChannel) {
  if (channel.readyState === 'open') return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('Timed out opening the local voice data channel.')), 15_000)
    const onOpen = () => finish()
    const onClose = () => finish(new Error('The local voice host closed the data channel.'))
    const finish = (error?: Error) => {
      window.clearTimeout(timeout)
      channel.removeEventListener('open', onOpen)
      channel.removeEventListener('close', onClose)
      error ? reject(error) : resolve()
    }
    channel.addEventListener('open', onOpen)
    channel.addEventListener('close', onClose)
  })
}

function takeSpeakablePhrases(read: () => string, write: (value: string) => void) {
  const phrases: string[] = []
  let text = read()
  const match = /[.!?](?:[”’"')\]]*)\s+/.exec(text)
  if (match) {
    phrases.push(text.slice(0, match.index + match[0].trimEnd().length).trim())
    text = text.slice(match.index + match[0].length)
  }
  if (text.length > 280) {
    const split = text.lastIndexOf(' ', 280)
    if (split > 120) { phrases.push(text.slice(0, split).trim()); text = text.slice(split + 1) }
  }
  write(text)
  return phrases.filter(Boolean)
}

function recordMetric(name: string, value: number) {
  try {
    const metrics = JSON.parse(localStorage.getItem('paper-board.voiceMetrics') || '[]') as Array<{ at: string; name: string; value: number }>
    metrics.push({ at: new Date().toISOString(), name, value: Math.round(value * 100) / 100 })
    localStorage.setItem('paper-board.voiceMetrics', JSON.stringify(metrics.slice(-500)))
  } catch { /* metrics never affect a tutoring turn */ }
}
