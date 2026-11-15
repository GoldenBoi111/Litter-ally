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

test('each explanation turn starts one detailed diagram without waiting for it', async () => {
  const requests = []
  const tutor = new HybridTutor({
    drawDiagram: (_index, request) => { requests.push(request); return new Promise(() => undefined) },
    onStatus: () => undefined, onTranscript: () => undefined,
  })
  tutor.closed = false
  tutor.queueTeachingBeat = async () => undefined
  const beat = { beatId: 'idea', context: 'Explaining an idea', speech: 'Here is the idea.', pauseMs: 0, waitForLearner: true, actions: [] }
  await tutor.executeTool('present_teaching_beat', JSON.stringify(beat))
  await tutor.executeTool('present_teaching_beat', JSON.stringify({ ...beat, beatId: 'more' }))
  assert.deepEqual(requests, [''])

  tutor.turnId += 1
  tutor.visualRequest = 'Why does this happen?'
  await tutor.executeTool('present_teaching_beat', JSON.stringify({ ...beat, beatId: 'answer' }))
  await tutor.executeTool('draw_lesson_diagram', JSON.stringify({ diagramIndex: 0, request: 'duplicate' }))
  assert.deepEqual(requests, ['', 'Why does this happen?'])

  tutor.respond = async () => undefined
  tutor.acceptTranscript('Could you explain the next part?', tutor.turnId)
  await tutor.executeTool('present_teaching_beat', JSON.stringify({ ...beat, beatId: 'next_answer' }))
  assert.deepEqual(requests, ['', 'Why does this happen?', 'Could you explain the next part?'])
})

test('a learner question sends the marked canvas crop to the voice tutor', async () => {
  let input
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, options) => {
    input = JSON.parse(options.body).input
    return new Response('data: {"type":"output","output":[]}\n\n', { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    const tutor = new HybridTutor({
      getSelection: () => ({ mode: 'recent-user-mark', bounds: { x: 10, y: 20, w: 100, h: 70 }, shapes: [{ id: 'circle', type: 'draw', text: '', owner: 'user', bounds: { x: 10, y: 20, w: 100, h: 70 } }] }),
      getSelectionImage: async () => 'data:image/png;base64,AAAA',
      getWhiteboardContext: () => '{}',
      onStatus: () => undefined, onTranscript: () => undefined,
    })
    tutor.closed = false
    tutor.title = 'Lesson'
    tutor.brief = { checkpoint: { title: 'Concept' } }
    tutor.input = [{ type: 'message', role: 'user', content: 'What is this?' }]
    tutor.selectionPending = true
    await tutor.respond()
    const reference = input.find(item => Array.isArray(item.content) && item.content.some(part => part.type === 'input_image'))
    assert.ok(reference, 'the voice request includes the circled region')
    assert.equal(reference.content.find(part => part.type === 'input_image').image_url, 'data:image/png;base64,AAAA')
  } finally {
    globalThis.fetch = originalFetch
  }
})
