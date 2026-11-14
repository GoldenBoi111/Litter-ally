import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformWithOxc } from 'vite'
import { compressLegacySegments, drawShapeProps } from '@tldraw/tlschema'

const source = readFileSync(new URL('../src/lessonAgent.ts', import.meta.url), 'utf8')
let compiled = (await transformWithOxc(source, 'src/lessonAgent.ts')).code
const storageMock = `data:text/javascript,${encodeURIComponent("export const knowledgeNodeId = value => value")}`
const tldrawMock = `data:text/javascript,${encodeURIComponent("export const createShapeId = value => `shape:${value}`; export const toRichText = value => value")}`
const schemaMock = `data:text/javascript,${encodeURIComponent("export const compressLegacySegments = value => value")}`
compiled = compiled
  .replace(/from ["']tldraw["']/, `from ${JSON.stringify(tldrawMock)}`)
  .replace(/from ["']@tldraw\/tlschema["']/, `from ${JSON.stringify(schemaMock)}`)
  .replace(/from ["']\.\.\/server\/agent-actions\.mjs["']/, `from ${JSON.stringify(new URL('./agent-actions.mjs', import.meta.url).href)}`)
  .replace(/from ["']\.\/storage["']/, `from ${JSON.stringify(storageMock)}`)
const { applyTeachingBeat, getSelectionContext } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('installed tldraw schema accepts the native compressed pen segments', () => {
  const segments = compressLegacySegments([{ type: 'free', points: [{ x: 0, y: 0, z: 0.5 }, { x: 20, y: 10, z: 0.5 }] }])
  assert.deepEqual(drawShapeProps.segments.validate(segments), segments)
})

function fakeEditor(initial = []) {
  const shapes = new Map(initial.map(shape => [shape.id, shape]))
  return {
    shapes,
    getCurrentPageShapes: () => [...shapes.values()],
    getShape: id => shapes.get(id),
    createShape: shape => shapes.set(shape.id, { ...shape }),
    updateShape: update => {
      const current = shapes.get(update.id)
      shapes.set(update.id, { ...current, ...update, props: { ...current?.props, ...update.props }, meta: update.meta ?? current?.meta })
    },
    deleteShapes: ids => ids.forEach(id => shapes.delete(typeof id === 'string' ? id : id.id)),
    getShapesPageBounds: ids => ids.length ? { x: 0, y: 0, w: 400, h: 200 } : null,
    zoomToBounds: () => undefined,
    getSelectionPageBounds: () => null,
    getShapePageBounds: shape => shape.bounds || { x: 0, y: 0, w: 100, h: 100 },
    getShapeUtil: () => ({ getText: shape => shape.text || '' }),
  }
}

function beat(points = 12) {
  return {
    beatId: 'derive_one', context: 'Derive the first line.', speech: 'Write the first line.', pauseMs: 0, waitForLearner: false,
    placement: 'new-section', anchorBeatId: '',
    actions: [
      { _type: 'text', id: 'equation', atMs: 0, x: 20, y: 20, text: 'y = mx + b', color: 'black', size: 'l' },
      { _type: 'stroke', id: 'underline', atMs: 0, points: Array.from({ length: points }, (_, index) => ({ x: 20 + index * 10, y: 80 + index % 2 })), color: 'blue', size: 'm', closed: false },
    ],
  }
}

test('animates a beat into stable completed native shapes', async () => {
  const editor = fakeEditor()
  const result = await applyTeachingBeat(editor, beat(4), { lessonId: 'paper', checkpointIndex: 0, signal: new AbortController().signal })
  assert.equal(editor.shapes.size, 2)
  assert.deepEqual(result.actions.map(action => action.state), ['complete', 'complete'])
  assert.ok([...editor.shapes.values()].some(shape => shape.type === 'draw' && shape.props.isComplete))
})

test('keeps partial ink and resumes the same stable stroke without duplication', async () => {
  const editor = fakeEditor()
  const controller = new AbortController()
  const strokeBeat = { ...beat(24), actions: [beat(24).actions[1]] }
  const running = applyTeachingBeat(editor, strokeBeat, { lessonId: 'paper', checkpointIndex: 0, signal: controller.signal })
  setTimeout(() => controller.abort(), 70)
  await assert.rejects(running, error => error?.name === 'AbortError')
  const partial = [...editor.shapes.values()].find(shape => shape.type === 'draw')
  assert.equal(partial.meta.actionState, 'interrupted')
  assert.ok(partial.meta.actionProgress < 24)
  const count = editor.shapes.size
  const resumed = await applyTeachingBeat(editor, strokeBeat, { lessonId: 'paper', checkpointIndex: 0, signal: new AbortController().signal })
  assert.equal(editor.shapes.size, count)
  assert.ok(resumed.actions.every(action => action.state === 'complete'))
})

test('rapid repeated interruptions never duplicate the stable action', async () => {
  const editor = fakeEditor()
  const strokeBeat = { ...beat(30), actions: [beat(30).actions[1]] }
  for (const delay of [35, 55]) {
    const controller = new AbortController()
    const running = applyTeachingBeat(editor, strokeBeat, { lessonId: 'paper', checkpointIndex: 0, signal: controller.signal })
    setTimeout(() => controller.abort(), delay)
    await assert.rejects(running, error => error?.name === 'AbortError')
    assert.equal(editor.shapes.size, 1)
  }
  await applyTeachingBeat(editor, strokeBeat, { lessonId: 'paper', checkpointIndex: 0, signal: new AbortController().signal })
  assert.equal(editor.shapes.size, 1)
  assert.equal([...editor.shapes.values()][0].meta.actionState, 'complete')
})

test('agent revision cannot remove a learner shape with the same action id', async () => {
  const userShape = { id: 'shape:user', type: 'draw', meta: { actionId: 'equation' }, props: {}, bounds: { x: 0, y: 0, w: 10, h: 10 } }
  const editor = fakeEditor([userShape])
  const revision = { ...beat(2), beatId: 'revise_one', actions: [{ _type: 'remove', id: 'erase', atMs: 0, targetId: 'equation' }] }
  await applyTeachingBeat(editor, revision, { lessonId: 'paper', checkpointIndex: 0, signal: new AbortController().signal })
  assert.equal(editor.shapes.get(userShape.id), userShape)
})

test('uses the latest learner freehand mark as structured reference context', () => {
  const agent = { id: 'shape:agent', type: 'text', text: 'x squared', meta: { owner: 'agent' }, bounds: { x: 20, y: 20, w: 80, h: 30 } }
  const circle = { id: 'shape:circle', type: 'draw', meta: {}, bounds: { x: 10, y: 10, w: 110, h: 70 } }
  const context = getSelectionContext(fakeEditor([agent, circle]))
  assert.equal(context.mode, 'recent-user-mark')
  assert.deepEqual(context.shapes.map(shape => shape.owner), ['agent', 'user'])
})
