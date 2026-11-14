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

test('drops concepts no checkpoint teaches instead of rejecting the plan', () => {
  const concept = (id, prerequisites = []) => ({ id, name: id, explanation: `${id} explained`, sourcePages: [1], prerequisites })
  const link = id => ({ id, reason: 'needed first', relationType: 'explicit', evidencePages: [1] })
  const plan = validateTeachingPlan({
    conceptMap: [concept('rates'), concept('inflation', [link('rates')]), concept('orphan'), concept('later', [link('orphan')])],
    sessions: [{ title: 'Rates', sourcePages: [1], conceptIds: ['rates', 'inflation'] }, { title: 'Later', sourcePages: [1], conceptIds: ['later'] }],
  }, 2)
  assert.deepEqual(plan.conceptMap.map(c => c.id).sort(), ['inflation', 'later', 'rates'])
  assert.deepEqual(plan.conceptMap.find(c => c.id === 'later').prerequisites, [])
})
