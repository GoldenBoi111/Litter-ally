// TEMPORARY end-to-end voice harness - delete after use. Drives the real HybridTutor against the live local voice stack.
import { HybridTutor } from './hybridTutor'
const out = document.getElementById('out')!
const t0 = performance.now()
const log = (m: string) => { out.textContent += `\n[${((performance.now() - t0) / 1000).toFixed(1)}s] ${m}` }
let played = 0
const origStart = AudioBufferSourceNode.prototype.start
AudioBufferSourceNode.prototype.start = function (...a: any[]) { played += 1; return (origStart as any).apply(this, a) }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const PAGE = 'Attention lets a neural network weigh how relevant each word is to every other word. Each word makes a query, key and value; the softmax of query-key scores weights the values. Multi-head attention runs several of these in parallel.'
try {
  const creds = { email: 'voice-e2e-test@example.test', password: 'voice-e2e-test-pass', name: 'Voice test' }
  let r = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(creds) })
  if (r.status === 409) r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(creds) })
  log(`auth: HTTP ${r.status}`)
  const checkpoint = { title: 'What attention does', minutes: 3, goal: 'Explain self-attention simply', concepts: ['attention'], activities: [], narration: 'Explain attention with queries, keys and values.', sourcePages: [1], pageFocus: 'query key value weighting', diagrams: [], checkForUnderstanding: 'What does the softmax do?' }
  const brief: any = { checkpoint, checkpointIndex: 0, sourcePageCount: 1, concepts: [], prerequisites: [], learnerEvidence: [], priorPropositions: [], priorChains: [] }
  const ctx = new AudioContext(); void ctx.resume()
  let beats = 0
  const tutor = new HybridTutor({
    presentTeachingBeat: async (beat: any) => { beats += 1; log(`BEAT ${beats}: speech ${String(beat.speech || '').length} chars: "${String(beat.speech || '').slice(0, 90)}…"`); await sleep(300); return { beatId: beat.id, actions: [] } as any },
    drawDiagram: async () => 'Diagram skipped in test.',
    showSourcePage: async () => ({ message: 'Showing page 1.', pageText: PAGE }),
    readSourcePage: () => PAGE,
    moveCheckpoint: async () => 'Stayed on this checkpoint.',
    getSelection: () => null,
    getWhiteboardContext: () => 'Empty board.',
    getTeachingState: (beatId: string) => ({ beatId, actions: [] }) as any,
    onStatus: (s, d) => log(`status: ${s}${d ? ' - ' + d : ''}`),
    onTranscript: lines => { const l = lines[lines.length - 1]; if (l) log(`transcript ${l.role}: ${l.text.slice(0, 100)}`) },
  }, ctx, {})
  await tutor.connect('Attention test', brief)
  log('connect() returned')
  const vad = (tutor as any).vad
  log(`vad present: ${!!vad}`)
  let maxProb = 0, frames = 0
  if (vad) {
    const o = vad.options
    const wrap = (k: string, f: (...a: any[]) => void) => { const orig = o[k]; o[k] = (...a: any[]) => { f(...a); return orig(...a) } }
    wrap('onFrameProcessed', (p: any) => { frames += 1; maxProb = Math.max(maxProb, p.isSpeech) })
    wrap('onSpeechStart', () => log('VAD onSpeechStart'))
    wrap('onSpeechRealStart', () => log('VAD onSpeechRealStart'))
    wrap('onVADMisfire', () => log('VAD misfire'))
    wrap('onSpeechEnd', (a: any) => log(`VAD onSpeechEnd ${a?.length} samples`))
  }
  const track = (tutor as any).micStream?.getAudioTracks?.()[0]
  setInterval(() => { if (frames) { log(`vad frames=${frames} maxSpeechProb=${maxProb.toFixed(2)} track.enabled=${track?.enabled} readyState=${track?.readyState}`); frames = 0; maxProb = 0 } }, 1000)
  for (let i = 0; i < 50 && played === 0; i++) await sleep(500)
  log(`audio chunks played so far: ${played}`)
  await sleep(6000)
  log(`--- holding talk button (fake mic plays the question)`)
  await tutor.setMicMuted(false)
  await sleep(6500)
  await tutor.setMicMuted(true)
  log(`--- released talk button`)
  const before = played
  for (let i = 0; i < 70; i++) { await sleep(500); if (played > before + 3) break }
  log(`audio chunks after question: ${played - before}`)
  await sleep(3000)
  tutor.close()
  log('DONE')
} catch (e: any) { log('FAIL: ' + (e?.name || '') + ' ' + (e?.message || e)); log('DONE') }
