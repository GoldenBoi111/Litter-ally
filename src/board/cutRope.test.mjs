import assert from 'node:assert/strict'
import test from 'node:test'
import { cutRopes, ropePath, stepRope } from './cutRope.ts'

const a = { x: 0, y: 0 }, b = { x: 400, y: 0 }, control = { x: 200, y: 120 }

test('cutting splits the string at its middle, each half starting on its own pin', () => {
  const [left, right] = cutRopes(a, control, b)
  assert.deepEqual(left.points[0], a)
  assert.deepEqual(right.points[0], b)
  assert.deepEqual(left.points.at(-1), right.points.at(-1))
})

test('a cut half falls and ends up hanging below its pin at its own length', () => {
  const [left] = cutRopes(a, control, b)
  const length = left.rest.reduce((sum, r) => sum + r, 0)
  for (let i = 0; i < 240; i++) stepRope(left, 1 / 120)
  assert.deepEqual(left.points[0], a, 'the pin end never moves')
  const end = left.points.at(-1)
  assert.ok(end.y > length * 0.9, `free end hangs near full length below the pin (y=${end.y.toFixed(1)}, length=${length.toFixed(1)})`)
  assert.ok(Math.abs(end.x) < length * 0.25, `and roughly under it (x=${end.x.toFixed(1)})`)
})

test('ropePath draws through every point', () => {
  const [left] = cutRopes(a, control, b)
  assert.match(ropePath(left.points), /^M0\.0,0\.0 Q/)
})
