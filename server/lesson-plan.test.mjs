import test from 'node:test'
import assert from 'node:assert/strict'
import { validateTeachingPlan } from './lesson-plan.mjs'

test('accepts checkpoint pages inside the imported paper', () => {
  const plan = { sessions: [{ sourcePages: [1, 3] }] }
  assert.equal(validateTeachingPlan(plan, 3), plan)
})

test('rejects checkpoint pages outside the imported paper', () => {
  assert.throws(() => validateTeachingPlan({ sessions: [{ sourcePages: [4] }] }, 3), /outside this 3-page paper/)
})
