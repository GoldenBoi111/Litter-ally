import { HybridTutor } from '../hybridTutor'
const w = window as any
w.testVoice = async () => {
  const log: string[] = []
  const tutor: any = new HybridTutor({ onStatus: (s: string, d?: string) => log.push(`status ${s} ${d || ''}`), onTranscript: () => {}, presentTeachingBeat: async (b: any) => ({ beatId: b.beatId, actions: [] }), drawDiagram: async () => '', showSourcePage: async () => ({ message: '' }), readSourcePage: () => '', moveCheckpoint: async () => '', getSelection: () => null, getTeachingState: (id: string) => ({ beatId: id, actions: [] }) } as any, new AudioContext())
  const play = tutor.playPcm.bind(tutor)
  let chunks = 0, samples = 0
  tutor.playPcm = (input: any) => { chunks++; samples += (typeof input === 'string' ? atob(input).length : input.byteLength) / 2; return play(input) }
  try { await tutor.connect('t', {}) } catch (e) { log.push('connect error ' + e) }
  const t0 = performance.now()
  const ok = await tutor.speak('Hello there. Can you hear me clearly now?', tutor.turnId)
  log.push(`speak ok=${ok} browserVoice=${tutor.browserVoice} ctx=${tutor.audioContext?.state} chunks=${chunks} seconds=${(samples / 24000).toFixed(2)} ms=${Math.round(performance.now() - t0)}`)
  tutor.close()
  return log
}
