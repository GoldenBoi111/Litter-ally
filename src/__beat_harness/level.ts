import { createSpeechOutput } from '../hybridTutor'
;(window as any).level = async (b64: string) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1)
  const measure = async (boost: boolean) => {
    const ctx = new OfflineAudioContext(1, pcm.length, 24000); const buf = ctx.createBuffer(1, pcm.length, 24000); const ch = buf.getChannelData(0)
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(boost ? createSpeechOutput(ctx as any) : ctx.destination); src.start()
    const out = (await ctx.startRendering()).getChannelData(0); let sum = 0, peak = 0
    for (const v of out) { sum += v * v; peak = Math.max(peak, Math.abs(v)) }
    const db = (x: number) => (20 * Math.log10(x)).toFixed(1)
    return `rms ${db(Math.sqrt(sum / out.length))} dBFS, peak ${db(peak)} dBFS`
  }
  return { before: await measure(false), after: await measure(true) }
}
