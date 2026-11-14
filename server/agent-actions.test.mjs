import test from 'node:test'
import assert from 'node:assert/strict'
import { diagramPlanSchema, validateDiagramPlan, validateTeachingBeat } from './agent-actions.mjs'

const valid = {
  actions: [
    { _type: 'create', id: 'input', shape: 'box', text: 'Input', color: 'blue' },
    { _type: 'create', id: 'process', shape: 'box', text: 'Process', color: 'grey' },
    { _type: 'create', id: 'output', shape: 'ellipse', text: 'Output', color: 'green' },
    { _type: 'connect', id: 'flow', fromId: 'input', toId: 'process', label: 'transforms', color: 'grey' },
    { _type: 'connect', id: 'result', fromId: 'process', toId: 'output', label: 'produces', color: 'grey' },
  ],
}

test('accepts a bounded diagram action plan', () => {
  assert.equal(validateDiagramPlan(valid), valid)
})

test('allows detailed freehand diagrams within the action bound', () => {
  const actions = Array.from({ length: 39 }, (_, index) => ({
    _type: 'stroke', id: `line_${index}`, atMs: 0, points: [{ x: index, y: 0 }, { x: index, y: 10 }],
    color: 'black', size: 'm', closed: false,
  }))
  actions.push({ _type: 'text', id: 'label', atMs: 0, x: 0, y: 20, text: 'Bond', color: 'black', size: 'm' })
  assert.equal(validateDiagramPlan({ actions }).actions.length, 40)
  assert.throws(() => validateDiagramPlan({ actions: [...actions, { ...actions[0], id: 'extra' }] }), /outside the supported range/)
})

test('allows a recognizable freehand sketch without a text label', () => {
  const actions = Array.from({ length: 4 }, (_, index) => ({
    _type: 'stroke', id: `part_${index}`, atMs: 0, points: [{ x: index * 10, y: 0 }, { x: index * 10, y: 10 }],
    color: 'black', size: 'm', closed: false,
  }))
  assert.equal(validateDiagramPlan({ actions }).actions.length, 4)
})

test('gives every strict diagram action discriminator an explicit JSON Schema type', () => {
  const variants = diagramPlanSchema.properties.actions.items.anyOf
  assert.deepEqual(variants.map(variant => variant.properties._type), [
    { type: 'string', const: 'create' },
    { type: 'string', const: 'connect' },
    { type: 'string', const: 'stroke' },
    { type: 'string', const: 'text' },
  ])
})

test('rejects destructive actions outside the agent vocabulary', () => {
  assert.throws(() => validateDiagramPlan({ actions: [...valid.actions.slice(0, 3), { _type: 'delete', id: 'remove-user-work' }] }), /Unsupported diagram action/)
})

test('rejects connections to shapes that were not created by the plan', () => {
  const actions = [...valid.actions.slice(0, 3), { ...valid.actions[3], toId: 'user-shape' }]
  assert.throws(() => validateDiagramPlan({ actions }), /must follow/)
})

test('rejects a connection streamed before its endpoint shapes', () => {
  assert.throws(() => validateDiagramPlan({ actions: [valid.actions[3], ...valid.actions.slice(0, 3)] }), /must follow/)
})

const validBeat = {
  beatId: 'equation_step_1', context: 'Introduce the first term.', speech: 'Start with the input on the left.', pauseMs: 500,
  waitForLearner: false, placement: 'new-section', anchorBeatId: '',
  actions: [
    { _type: 'text', id: 'equation', atMs: 0, x: 40, y: 40, text: 'y = mx + b', color: 'black', size: 'l' },
    { _type: 'stroke', id: 'underline', atMs: 250, points: [{ x: 35, y: 95 }, { x: 220, y: 97 }], color: 'blue', size: 'm', closed: false },
  ],
}

test('accepts bounded pen-first teaching beats', () => {
  assert.deepEqual(validateTeachingBeat(structuredClone(validBeat)), validBeat)
})

test('rejects unsafe, unbounded, and duplicate teaching actions', () => {
  assert.throws(() => validateTeachingBeat({ ...validBeat, actions: [{ ...validBeat.actions[1], points: [{ x: -1, y: 0 }, { x: 1, y: 1 }] }] }), /invalid pen stroke/)
  assert.throws(() => validateTeachingBeat({ ...validBeat, actions: [validBeat.actions[0], { ...validBeat.actions[1], id: 'equation' }] }), /duplicate action id/)
  assert.throws(() => validateTeachingBeat({ ...validBeat, actions: [{ _type: 'remove', id: 'erase', atMs: 0, targetId: '../user-shape' }] }), /invalid revision target/)
  assert.throws(() => validateTeachingBeat({ ...validBeat, speech: 'x'.repeat(601) }), /invalid teaching beat/)
})

const widgetBeat = widget => ({ beatId: 'data', context: 'Show the figures.', speech: 'Here are the numbers from the study.', pauseMs: 0, waitForLearner: true, placement: 'new-section', anchorBeatId: '', actions: [{ _type: 'widget', id: 'chart', atMs: 0, x: 40, y: 40, w: 520, h: 320, title: 'Results', labels: [], series: [], rows: [], unit: '', ...widget }] })

test('accepts every widget kind filled in its documented shape', () => {
  for (const widget of [
    { kind: 'table', labels: ['Model', 'Score'], rows: [['A', '91'], ['B', '84']] },
    { kind: 'bar', labels: ['2019', '2020', '2021'], series: [{ name: 'Sales', values: [3, 5, 4] }, { name: 'Costs', values: [2, 2, 3] }] },
    { kind: 'line', labels: ['Mon', 'Tue'], series: [{ name: 'Temp', values: [-2, 4.5] }], unit: '°' },
    { kind: 'pie', labels: ['Yes', 'No'], series: [{ name: 'Votes', values: [60, 40] }] },
    { kind: 'stats', labels: ['Accuracy'], series: [{ name: 'Figures', values: [97.3] }], unit: '%' },
    { kind: 'timeline', rows: [['1905', 'Special relativity'], ['1915', 'General relativity']] },
  ]) assert.doesNotThrow(() => validateTeachingBeat(widgetBeat(widget)), widget.kind)
})

test('rejects widgets whose data does not match their kind or leaves the drawing area', () => {
  assert.throws(() => validateTeachingBeat(widgetBeat({ kind: 'bar', labels: ['a', 'b'], series: [{ name: 's', values: [1] }] })), /bar widget/)
  assert.throws(() => validateTeachingBeat(widgetBeat({ kind: 'table', labels: ['a', 'b'], rows: [['only one']] })), /table widget/)
  assert.throws(() => validateTeachingBeat(widgetBeat({ kind: 'pie', labels: ['a', 'b'], series: [{ name: 's', values: [0, 0] }] })), /pie widget/)
  assert.throws(() => validateTeachingBeat(widgetBeat({ kind: 'timeline', rows: [['1905', 'one', 'extra'], ['1915', 'two']] })), /timeline widget/)
  assert.throws(() => validateTeachingBeat(widgetBeat({ kind: 'table', labels: ['a'], rows: [['x']], x: 900 })), /table widget/)
  assert.throws(() => validateTeachingBeat(widgetBeat({ kind: 'chart', labels: ['a'] })), /chart widget/)
})
