import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desiredConnections, sourcePairKey } from './connections.ts'

test('generated links include every supported pair without duplicating manual or hidden strings', () => {
  const links = Array.from({ length: 60 }, (_, i) => ({ leftId: 'a', rightId: `s${i}`, relation: 'supports', reason: `Evidence ${i}` }))
  links.push({ leftId: 'missing', rightId: 'a', relation: 'supports', reason: 'Not on this board' })
  const sources = new Set(['a', ...Array.from({ length: 60 }, (_, i) => `s${i}`)])
  const hidden = new Set([sourcePairKey('a', 's1')])
  const manual = new Set([sourcePairKey('s2', 'a')])
  const desired = desiredConnections(links, sources, hidden, manual)
  assert.equal(desired.size, 58)
  assert.equal(desired.get(sourcePairKey('a', 's59'))?.reason, 'Evidence 59')
  assert.equal(desired.has(sourcePairKey('a', 's1')), false)
  assert.equal(desired.has(sourcePairKey('a', 's2')), false)
})
