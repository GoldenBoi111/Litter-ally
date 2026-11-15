class VoicePcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.pending = new Float32Array(320)
    this.offset = 0
  }

  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input) return true
    for (let i = 0; i < input.length; i++) {
      this.pending[this.offset++] = input[i]
      if (this.offset === this.pending.length) {
        const chunk = this.pending
        this.pending = new Float32Array(320)
        this.offset = 0
        this.port.postMessage(chunk.buffer, [chunk.buffer])
      }
    }
    return true
  }
}

registerProcessor('voice-pcm', VoicePcmProcessor)
