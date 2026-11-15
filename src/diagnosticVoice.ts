/** The diagnostic uses the same WebRTC control and PCM protocol as the live tutor. */
export class DiagnosticVoice {
  private peer: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private connecting: Promise<void> | null = null
  private sources = new Set<AudioBufferSourceNode>()
  private playAt = 0
  private speechId = 0
  private speechGeneration = 0
  private turn = 0
  private listening = false
  private closed = false
  private finishSpeech: (() => void) | null = null
  private speechDone = false
  private browserVoice = false
  private recognition: any = null
  private onTranscript: (text: string) => void
  private onError: (message: string) => void

  constructor(onTranscript: (text: string) => void, onError: (message: string) => void) {
    this.onTranscript = onTranscript
    this.onError = onError
  }

  connect() {
    return this.connecting ??= this.open().catch(error => {
      this.connecting = null
      if (!this.closed && browserSpeechAvailable()) { this.browserVoice = true; return }
      if (!this.closed) this.onError(`${error instanceof Error ? error.message : 'Local voice connection failed.'} This browser has no speech-recognition fallback; check microphone support or type your answer.`)
      throw error
    })
  }

  private async open() {
    const config = await fetch('/api/voice/config').then(response => response.json()) as { iceServers?: RTCIceServer[] }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    if (this.closed) { stream.getTracks().forEach(track => track.stop()); return }
    this.stream = stream
    stream.getAudioTracks().forEach(track => { track.enabled = false })
    const peer = new RTCPeerConnection({ iceServers: config.iceServers || [] })
    this.peer = peer
    const channel = peer.createDataChannel('voice-control')
    channel.binaryType = 'arraybuffer'
    channel.onmessage = event => this.onMessage(event.data)
    peer.onconnectionstatechange = () => { if (!this.closed && peer.connectionState === 'failed') { this.cancelSpeech(); this.onError('The local voice connection was lost. Try the diagnostic again.') } }
    stream.getAudioTracks().forEach(track => peer.addTrack(track, stream))
    try {
      await peer.setLocalDescription(await peer.createOffer())
      if (peer.iceGatheringState !== 'complete') await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('WebRTC could not find a local network candidate.')), 4000)
        peer.addEventListener('icegatheringstatechange', () => {
          if (peer.iceGatheringState === 'complete') { clearTimeout(timeout); resolve() }
        })
      })
      const request: RequestInit = {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(peer.localDescription), signal: AbortSignal.timeout(20_000),
      }
      const response = await fetch('/api/voice/offer', request)
      if (!response.ok) throw new Error(`Local voice host returned HTTP ${response.status}.`)
      await peer.setRemoteDescription(await response.json())
      await new Promise<void>((resolve, reject) => {
        if (channel.readyState === 'open') return resolve()
        const timeout = window.setTimeout(() => reject(new Error('Local voice channel timed out.')), 15_000)
        channel.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
        channel.addEventListener('close', () => { clearTimeout(timeout); reject(new Error('Local voice channel closed.')) }, { once: true })
      })
      if (this.closed) this.close()
      else { this.channel = channel; this.context = new AudioContext() }
    } catch (error) {
      peer.close()
      stream.getTracks().forEach(track => track.stop())
      throw error
    }
  }

  private send(value: Record<string, unknown>) {
    if (this.channel?.readyState !== 'open') throw new Error('Local voice channel is unavailable.')
    this.channel.send(JSON.stringify(value))
  }

  async speak(text: string, onEnd: () => void) {
    const generation = ++this.speechGeneration
    await this.connect()
    if (this.closed || generation !== this.speechGeneration) return
    if (this.browserVoice) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = () => { if (generation === this.speechGeneration) onEnd() }
      window.speechSynthesis.speak(utterance)
      return
    }
    void this.context?.resume()
    // shortcut: long unbroken words may be split, use sentence-aware chunks if diagnostic copy grows.
    for (const chunk of text.match(/[\s\S]{1,850}/g) || []) {
      if (generation !== this.speechGeneration) return
      const id = String(++this.speechId)
      this.speechDone = false
      await new Promise<void>(resolve => {
        this.finishSpeech = resolve
        this.send({ type: 'speak', id, text: chunk })
      })
    }
    if (generation === this.speechGeneration) onEnd()
  }

  cancelSpeech() {
    this.speechGeneration += 1
    this.speechId += 1
    this.finishSpeech?.()
    this.finishSpeech = null
    this.speechDone = false
    this.sendIfOpen({ type: 'cancel' })
    if (this.browserVoice) window.speechSynthesis.cancel()
    this.sources.forEach(source => { try { source.stop() } catch { /* already ended */ } })
    this.sources.clear()
    this.playAt = this.context?.currentTime || 0
  }

  async start() {
    await this.connect()
    if (this.closed) return
    if (this.browserVoice) {
      this.cancelSpeech()
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      let transcript = ''
      let failed = false
      recognition.lang = 'en-US'
      recognition.interimResults = false
      recognition.continuous = true
      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) transcript += ` ${event.results[i][0].transcript}`
      }
      recognition.onerror = (event: any) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          failed = true
          this.listening = false
          this.onError(`Speech recognition failed: ${event.error}`)
        }
      }
      recognition.onend = () => {
        if (this.recognition === recognition) this.recognition = null
        this.listening = false
        if (this.closed || failed) return
        const text = transcript.trim()
        if (text) this.onTranscript(text)
        else this.onError('I didn’t catch that. Hold Space or tap the mic and try again.')
      }
      this.recognition = recognition
      try { recognition.start(); this.listening = true }
      catch (error) { this.recognition = null; throw error }
      return
    }
    await this.context?.resume()
    this.cancelSpeech()
    this.turn += 1
    this.send({ type: 'speech.start', turn: this.turn })
    this.stream?.getAudioTracks().forEach(track => { track.enabled = true })
    this.listening = true
  }

  stop() {
    if (!this.listening) return false
    this.listening = false
    if (this.browserVoice) { this.recognition?.stop(); return true }
    this.stream?.getAudioTracks().forEach(track => { track.enabled = false })
    this.send({ type: 'speech.end', turn: this.turn })
    return true
  }

  private sendIfOpen(value: Record<string, unknown>) {
    if (this.channel?.readyState === 'open') {
      try { this.channel.send(JSON.stringify(value)) } catch { /* closing the channel must still release the microphone */ }
    }
  }

  private onMessage(data: string | ArrayBuffer) {
    if (this.closed) return
    if (data instanceof ArrayBuffer) {
      if (data.byteLength < 6 || String(new DataView(data).getUint32(0)) !== String(this.speechId) || !this.context) return
      const pcm = new Int16Array(data.slice(4))
      const buffer = this.context.createBuffer(1, pcm.length, 24_000)
      const samples = buffer.getChannelData(0)
      for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768
      const source = this.context.createBufferSource()
      source.buffer = buffer
      source.connect(this.context.destination)
      this.playAt = Math.max(this.context.currentTime + 0.015, this.playAt)
      source.start(this.playAt)
      this.playAt += buffer.duration
      this.sources.add(source)
      source.onended = () => { this.sources.delete(source); if (this.speechDone && !this.sources.size && this.finishSpeech) { const finish = this.finishSpeech; this.finishSpeech = null; finish() } }
      return
    }
    let message: { type?: string; id?: string; turn?: number; text?: string; error?: string }
    try { message = JSON.parse(data) } catch { this.onError('The local voice host sent an invalid message.'); return }
    if (message.type === 'transcript' && message.turn === this.turn) this.onTranscript(message.text?.trim() || '')
    if (message.type === 'speech.done' && message.id === String(this.speechId)) {
      this.speechDone = true
      if (!this.sources.size && this.finishSpeech) { const finish = this.finishSpeech; this.finishSpeech = null; finish() }
    }
    if (message.type === 'error') { this.cancelSpeech(); this.onError(message.error || 'Local voice processing failed.') }
  }

  close() {
    this.closed = true
    this.cancelSpeech()
    this.stream?.getTracks().forEach(track => track.stop())
    this.recognition?.abort()
    this.peer?.close()
    void this.context?.close()
    this.channel = null
    this.peer = null
  }
}

function browserSpeechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
}
