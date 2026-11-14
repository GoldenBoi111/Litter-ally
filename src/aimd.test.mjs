import assert from 'node:assert/strict'
import test from 'node:test'
import { AIMD, languageGuide, nextLevel, readLearnerSignal } from './aimd.ts'

test('understanding raises the level by one; struggling halves it', () => {
  assert.equal(nextLevel(5, 'understood'), 6)
  assert.equal(nextLevel(8, 'struggled'), 4)
  assert.equal(nextLevel(5, 'neutral'), 5)
})

test('the level stays within 1..10, and a bad stored value starts from the default', () => {
  assert.equal(nextLevel(10, 'understood'), 10)
  assert.equal(nextLevel(1, 'struggled'), 1)
  assert.equal(nextLevel(Number.NaN, 'neutral'), AIMD.start)
})

test('AIMD shape: one stumble undoes several successes, and recovery is gradual', () => {
  let level = AIMD.start
  for (let i = 0; i < 4; i++) level = nextLevel(level, 'understood')
  assert.equal(level, 9)
  level = nextLevel(level, 'struggled')
  assert.equal(level, 4)
  level = nextLevel(level, 'understood')
  assert.equal(level, 5)
})

test('learner messages are read for confusion and for wanting more', () => {
  for (const text of ['What does photosynthesis mean?', "I'm lost", 'can you explain it again more simply', "I don't follow", 'too technical for me']) {
    assert.equal(readLearnerSignal(text), 'struggled', text)
  }
  for (const text of ['I already know this part', 'go deeper into the mechanism', 'makes sense, next']) {
    assert.equal(readLearnerSignal(text), 'understood', text)
  }
  assert.equal(readLearnerSignal('How do the fungi find the roots?'), 'neutral')
})

test('the guide changes register across the range', () => {
  assert.match(languageGuide(2), /everyday words/)
  assert.match(languageGuide(9), /technical level/)
})
