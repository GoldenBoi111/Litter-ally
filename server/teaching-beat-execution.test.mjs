import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformWithOxc } from 'vite'
import { compressLegacySegments, drawShapeProps } from '@tldraw/tlschema'

const source = readFileSync(new URL('../src/lessonAgent.ts', import.meta.url), 'utf8')
let compiled = (await transformWithOxc(source, 'src/lessonAgent.ts')).code
const storageMock = `data:text/javascript,${encodeURIComponent("export const knowledgeNodeId = value => value; export const readApiJson = value => value")}`
const tldrawMock = `data:text/javascript,${encodeURIComponent("export const createShapeId = value => `shape:${value}`; export const toRichText = value => value")}`
const schemaMock = `data:text/javascript,${encodeURIComponent("export const compressLegacySegments = value => value")}`
compiled = compiled
  .replace(/from ["']tldraw["']/, `from ${JSON.stringify(tldrawMock)}`)
  .replace(/from ["']@tldraw\/tlschema["']/, `from ${JSON.stringify(schemaMock)}`)
  .replace(/from ["']\.\.\/server\/agent-actions\.mjs["']/, `from ${JSON.stringify(new URL('./agent-actions.mjs', import.meta.url).href)}`)
  .replace(/from ["']\.\/storage["']/, `from ${JSON.stringify(storageMock)}`)
const { applyDiagramPlan, applyTeachingBeat, getSelectionContext, getWhiteboardContext } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('installed tldraw schema accepts the native compressed pen segments', () => {
  const segments = compressLegacySegments([{ type: 'free', points: [{ x: 0, y: 0, z: 0.5 }, { x: 20, y: 10, z: 0.5 }] }])
  assert.deepEqual(drawShapeProps.segments.validate(segments), segments)
})

function fakeEditor(initial = []) {
  const shapes = new Map(initial.map(shape => [shape.id, shape]))
  const zooms = []
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
    zoomToBounds: bounds => { zooms.push(bounds) },
    zooms,
    getViewportPageBounds: () => ({ minX: 0, minY: 0, maxX: 1600, maxY: 900 }),
    getSelectionPageBounds: () => null,
    getShapePageBounds: shape => {
      if (shape.bounds) return shape.bounds
      if (shape.type === 'text') return { x: shape.x, y: shape.y, w: String(shape.props.richText).length * 20, h: 40 }
      if (shape.type === 'draw') {
        const points = shape.props.segments[0].points
        return { x: shape.x + Math.min(...points.map(point => point.x)), y: shape.y + Math.min(...points.map(point => point.y)), w: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) + 12, h: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) + 12 }
      }
      return { x: shape.x || 0, y: shape.y || 0, w: 100, h: 100 }
    },
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

test('continue placement builds on the previous beat and frames the area before drawing', async () => {
  const editor = fakeEditor()
  const signal = new AbortController().signal
  await applyTeachingBeat(editor, beat(4), { lessonId: 'paper', checkpointIndex: 0, signal })
  const first = [...editor.shapes.values()][0].meta
  assert.equal(editor.zooms.length, 1, 'off-screen drawing area is brought into view first')
  await applyTeachingBeat(editor, { ...beat(4), beatId: 'derive_two', placement: 'continue', actions: [{ ...beat(4).actions[0], x: 320, text: 'slope' }] }, { lessonId: 'paper', checkpointIndex: 0, signal })
  const second = [...editor.shapes.values()].filter(shape => shape.meta.beatId === 'derive_two')
  assert.ok(second.length && second.every(shape => shape.meta.originX === first.originX && shape.meta.originY === first.originY))
  await applyTeachingBeat(editor, { ...beat(4), beatId: 'derive_three' }, { lessonId: 'paper', checkpointIndex: 0, signal })
  const third = [...editor.shapes.values()].find(shape => shape.meta.beatId === 'derive_three').meta
  assert.ok(third.originY > first.originY, 'new-section starts a fresh area')
})

test('keeps new sections beside their source and below occupied drawings', async () => {
  const source = { id: 'shape:source', type: 'image', meta: { owner: 'source', checkpointId: '2' }, bounds: { x: 4800, y: 220, w: 950, h: 900 } }
  const editor = fakeEditor([source])
  const signal = new AbortController().signal
  await applyTeachingBeat(editor, { ...beat(2), actions: [beat(2).actions[0]] }, { lessonId: 'paper', checkpointIndex: 2, signal })
  const first = [...editor.shapes.values()].find(shape => shape.meta?.beatId === 'derive_one')
  assert.equal(first.meta.originX, 5900, 'tutor starts in the same 2400-pixel column as the source')
  assert.equal(first.meta.originY, 220, 'a typical source does not push the tutor far below')
  await applyTeachingBeat(editor, { ...beat(2), beatId: 'derive_two', actions: [beat(2).actions[0]] }, { lessonId: 'paper', checkpointIndex: 2, signal })
  const second = [...editor.shapes.values()].find(shape => shape.meta?.beatId === 'derive_two')
  assert.ok(second.y > first.y + 40 && second.y < first.y + 200, 'related sections stay close without overlapping')
})

test('moves a new beat clear of learner marks without moving learner work', async () => {
  const learner = { id: 'shape:learner', type: 'draw', meta: {}, bounds: { x: 1120, y: 240, w: 180, h: 90 } }
  const editor = fakeEditor([learner])
  await applyTeachingBeat(editor, { ...beat(2), actions: [beat(2).actions[0]] }, { lessonId: 'paper', checkpointIndex: 0, signal: new AbortController().signal })
  const agent = [...editor.shapes.values()].find(shape => shape.meta?.owner === 'agent')
  assert.ok(agent.y > learner.bounds.y + learner.bounds.h)
  assert.equal(editor.shapes.get(learner.id), learner)
})

test('long pen paths finish within the spoken beat instead of delaying later marks', async () => {
  const editor = fakeEditor()
  const actions = Array.from({ length: 3 }, (_, index) => ({
    _type: 'stroke', id: `path_${index}`, atMs: 0, color: 'blue', size: 'm', closed: false,
    points: Array.from({ length: 96 }, (_, point) => ({ x: 20 + point * 4, y: 40 + index * 100 + Math.sin(point / 8) * 10 })),
  }))
  const started = performance.now()
  await applyTeachingBeat(editor, { ...beat(), speech: 'Draw the three paths while explaining how each one changes direction over time.', actions }, { lessonId: 'paper', checkpointIndex: 0, signal: new AbortController().signal })
  assert.ok(performance.now() - started < 6_000, 'the animation keeps up with narration')
  assert.equal(editor.shapes.size, 3)
})

test('draws a diagram with more actions than a live teaching beat', async () => {
  const editor = fakeEditor()
  const actions = Array.from({ length: 13 }, (_, index) => ({
    _type: 'stroke', id: `line_${index}`, atMs: 0,
    points: [{ x: 20 + index * 20, y: 20 }, { x: 20 + index * 20, y: 40 }],
    color: 'black', size: 'm', closed: false,
  }))
  await applyDiagramPlan(editor, { actions }, {
    lessonId: 'paper', checkpointIndex: 0, diagramIndex: 0, diagramKind: 'mechanism', signal: new AbortController().signal,
  })
  assert.equal(editor.shapes.size, 13)
  assert.ok([...editor.shapes.values()].every(shape => shape.meta.actionState === 'complete'))
})

test('places a prepared diagram clear of existing learner ink', async () => {
  const learner = { id: 'shape:learner', type: 'draw', meta: {}, bounds: { x: 1130, y: 220, w: 100, h: 100 } }
  const editor = fakeEditor([learner])
  const actions = Array.from({ length: 4 }, (_, index) => ({
    _type: 'stroke', id: `line_${index}`, atMs: 0, points: [{ x: 20, y: 20 + index * 30 }, { x: 80, y: 20 + index * 30 }], color: 'black', size: 'm', closed: false,
  }))
  await applyDiagramPlan(editor, { actions }, { lessonId: 'paper', checkpointIndex: 0, diagramIndex: 0, diagramKind: 'mechanism', signal: new AbortController().signal })
  const drawn = [...editor.shapes.values()].filter(shape => shape.meta?.owner === 'agent')
  assert.equal(drawn.length, 4)
  assert.ok(drawn.every(shape => shape.meta.originY > 320))
  assert.equal(editor.shapes.get(learner.id), learner)
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

test('describes the latest drawing area with local positions and learner marks', () => {
  const earlier = { id: 'shape:earlier', type: 'text', text: 'earlier idea', meta: { owner: 'agent', lessonId: 'paper', checkpointId: '0', beatId: 'earlier', actionId: 'old_label', originX: 2000, originY: 80 }, bounds: { x: 2040, y: 110, w: 100, h: 24 } }
  const agent = { id: 'shape:agent', type: 'text', text: 'weight', meta: { owner: 'agent', lessonId: 'paper', checkpointId: '0', beatId: 'first', actionId: 'label', originX: 2000, originY: 220, actionState: 'complete' }, bounds: { x: 2040, y: 250, w: 90, h: 24 } }
  const learner = { id: 'shape:learner', type: 'draw', meta: {}, bounds: { x: 2050, y: 290, w: 40, h: 30 } }
  const other = { id: 'shape:other', type: 'text', text: 'private other lesson', meta: { owner: 'agent', lessonId: 'other', checkpointId: '0' }, bounds: { x: 2050, y: 300, w: 90, h: 24 } }
  const context = JSON.parse(getWhiteboardContext(fakeEditor([earlier, agent, learner, other]), 'paper', 0))
  assert.deepEqual(context.tutor[0], { beatId: 'first', actionId: 'label', type: 'text', text: 'weight', x: 40, y: 30, w: 90, h: 24, state: 'complete' })
  assert.equal(context.learner.length, 1)
  assert.equal(context.learner[0].x, 50)
  assert.deepEqual(context.nearby[0], { anchorBeatId: 'earlier', dx: 0, dy: -140, labels: ['earlier idea'] })
  assert.equal(JSON.stringify(context).includes('private other lesson'), false)
})
