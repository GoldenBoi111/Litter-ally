import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformWithOxc } from 'vite'

let compiled = (await transformWithOxc(readFileSync(new URL('../src/hybridTutor.ts', import.meta.url), 'utf8'), 'src/hybridTutor.ts')).code
const stub = source => `data:text/javascript,${encodeURIComponent(source)}`
compiled = compiled
  .replace(/from ["']@ricky0123\/vad-web["']/, `from ${JSON.stringify(stub('export const MicVAD = {}'))}`)
  .replace(/from ["']\.\/lessonAgent["']/, `from ${JSON.stringify(stub('export const formatCheckpointBrief = () => ""; export const readTeachingBeat = value => value'))}`)
  .replace(/from ["']\.\/voice-turn\.mjs["']/, `from ${JSON.stringify(stub('export const canContinueAfterUnrecognizedInterruption = () => false; export const shouldInterruptOnSpeechStart = () => false'))}`)
  .replace(/from ["']\.\/storage["']/, `from ${JSON.stringify(stub('export const checkApiResponse = () => undefined'))}`)
const { HybridTutor } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('whiteboard ink begins with speech playback, not while TTS is still loading', async () => {
  const events = []
  const tutor = new HybridTutor({
    presentTeachingBeat: async () => { events.push('draw'); return { actions: [{ state: 'complete' }] } },
    onStatus: () => undefined, onTranscript: () => undefined,
  })
  tutor.closed = false
  tutor.speak = async (_text, _turn, onStart) => {
    await new Promise(resolve => setTimeout(resolve, 30))
    events.push('audio')
    onStart()
    return true
  }
  await tutor.queueTeachingBeat({ beatId: 'first', speech: 'Hello.', context: 'Writing', pauseMs: 0, actions: [] }, 0)
  assert.deepEqual(events, [])
  await tutor.speechQueue
  assert.deepEqual(events, ['audio', 'draw'])
})
