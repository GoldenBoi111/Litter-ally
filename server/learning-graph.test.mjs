import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformWithOxc } from 'vite'

const source = readFileSync(new URL('../src/storage.ts', import.meta.url), 'utf8')
const compiled = (await transformWithOxc(source, 'src/storage.ts')).code
const { mergeTaughtKnowledge } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('merges taught propositions and reasoning chains without duplicating provenance', () => {
  const graph = { nodes: [], edges: [], propositions: [{
    id: 'foundation', concept: 'Foundation', statement: 'A prior idea.', sources: [],
  }], chains: [] }
  const update = {
    propositions: [{
      id: 'local_mechanism', name: 'Mechanism', statement: 'The process changes the outcome.', aliases: [],
      existingId: null, sourcePages: [2],
    }],
    chains: [{ premises: ['local_mechanism'], conclusion: 'foundation', reason: 'The process depends on this idea.', sourcePages: [2] }],
  }
  const source = { paperId: 'paper-1', paperTitle: 'Paper', checkpoint: 'Method' }

  const once = mergeTaughtKnowledge(graph, update, source)
  const twice = mergeTaughtKnowledge(once, update, source)

  assert.equal(twice.propositions.find(item => item.id === 'mechanism').sources.length, 1)
  assert.equal(twice.chains.length, 1)
  assert.deepEqual(twice.chains[0].premises, ['mechanism'])
  assert.equal(twice.chains[0].conclusion, 'foundation')
  assert.equal(twice.chains[0].sources.length, 1)
})
