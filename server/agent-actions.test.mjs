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
