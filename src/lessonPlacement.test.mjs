import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearVerticalOverlap } from './lessonPlacement.ts'

test('new lettering clears stacked existing marks', () => {
  const mark = { x: 100, y: 0, w: 400, h: 150 }
  const occupied = [{ x: 100, y: 0, w: 400, h: 150 }, { x: 100, y: 170, w: 400, h: 150 }]
  assert.equal(clearVerticalOverlap(mark, occupied), 368)
  assert.equal(clearVerticalOverlap({ ...mark, x: 600 }, occupied), 0)
})
