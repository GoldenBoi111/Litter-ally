import assert from 'node:assert/strict'
import test from 'node:test'
import { sagCurve, pinPoint } from './sag.ts'

test('string hangs below the line between its pins', () => {
  const { mid, sag } = sagCurve({ x: 0, y: 0 }, { x: 400, y: 0 })
  assert.equal(mid.x, 200)
  assert.equal(mid.y, sag)
  assert.ok(sag > 10)
})

test('sag is capped for long strings', () => {
  assert.equal(sagCurve({ x: 0, y: 0 }, { x: 5000, y: 0 }).sag, 90)
})

test('pin sits at the top centre of a card', () => {
  assert.deepEqual(pinPoint({ x: 10, y: 20, w: 300 }), { x: 160, y: 29 })
})
