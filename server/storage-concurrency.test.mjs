import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { transformWithOxc } from 'vite'

const source = readFileSync(new URL('../src/storage.ts', import.meta.url), 'utf8')
const compiled = (await transformWithOxc(source, 'src/storage.ts')).code
const { saveLearningOutcome } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('concurrent learning writes merge against the latest persisted graph', async () => {
  const previousIndexedDB = globalThis.indexedDB
  const stores = new Map()
  let writeQueue = Promise.resolve()
  let upgraded = false
  const database = {
    objectStoreNames: { contains: name => stores.has(name) },
    createObjectStore(name) { stores.set(name, new Map()) },
    transaction(_names, mode) {
      const requests = []
      const transaction = {
        objectStore(name) {
          const store = stores.get(name)
          return {
            get(key) {
              const request = {}
              requests.push(() => { request.result = store.get(key); request.onsuccess?.({ target: request }) })
              return request
            },
            put(value) { store.set(value.id, value) },
          }
        },
        abort() { transaction.onabort?.({ target: transaction }) },
      }
      const previous = mode === 'readwrite' ? writeQueue : Promise.resolve()
      let release
      if (mode === 'readwrite') writeQueue = new Promise(resolve => { release = resolve })
      previous.then(() => setTimeout(() => {
        for (const request of requests) request()
        transaction.oncomplete?.({ target: transaction })
        release?.()
      }, 0))
      return transaction
    },
  }
  globalThis.indexedDB = {
    open() {
      const request = {}
      setTimeout(() => {
        request.result = database
        if (!upgraded) { upgraded = true; request.onupgradeneeded?.({ target: request }) }
        request.onsuccess?.({ target: request })
      }, 0)
      return request
    },
  }
  stores.set('papers', new Map([['paper', { id: 'paper', learningState: { assessments: {}, practice: [] } }]]))
  stores.set('knowledge', new Map([['profile', { id: 'profile', graph: { nodes: [], edges: [], propositions: [] } }]]))

  const addProposition = id => graph => ({
    ...graph,
    propositions: [...(graph.propositions || []), { id, concept: id, statement: id, sources: [] }],
  })
  try {
    await Promise.all([
      saveLearningOutcome('paper', addProposition('from-tab-a'), state => state),
      saveLearningOutcome('paper', addProposition('from-tab-b'), state => state),
    ])
    const saved = stores.get('knowledge').get('profile').graph.propositions.map(item => item.id).sort()
    assert.deepEqual(saved, ['from-tab-a', 'from-tab-b'])
  } finally {
    globalThis.indexedDB = previousIndexedDB
  }
})
