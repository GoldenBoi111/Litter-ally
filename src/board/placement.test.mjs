import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openSpotNear } from './placement.ts'

test('new cards stay near related cards without covering existing marks', () => {
  const occupied = [{ x: 0, y: 0, w: 300, h: 210 }, { x: -370, y: -300, w: 300, h: 210 }]
  const spot = openSpotNear(occupied, { x: 0, y: 0 }, 300, 210)
  assert.deepEqual(spot, { x: 0, y: -300 })
  assert.ok(occupied.every(box => !(box.x < spot.x + 300 && spot.x < box.x + box.w && box.y < spot.y + 210 && spot.y < box.y + box.h)))
})
