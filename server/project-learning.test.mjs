import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'

let requestOptions
mock.module('./openai.mjs', { namedExports: {
  createStructuredResponse: async options => {
    requestOptions = options
    return { synthesis: 'Shared evidence', connections: Array.from({ length: 49 }, (_, i) => ({
      leftId: i < 31 ? 's0' : 's1', rightId: `s${i < 31 ? i + 1 : i - 29}`, relation: 'supports', reason: `Shared point ${i + 1}`,
    })) }
  },
} })
const { createProjectLearningRouter } = await import('./project-learning.mjs')

test('project synthesis accepts more than 48 connections and bounds all 32-source pairs', async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/project', createProjectLearningRouter({ openAIKey: () => 'test', model: 'test' }))
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  try {
    const sources = Array.from({ length: 32 }, (_, i) => ({ id: `s${i}`, title: `Source ${i}`, summary: `Point ${i}`, keyIdeas: [] }))
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/project/synthesis`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Project', sources }),
    })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).connections.length, 49)
    assert.equal(requestOptions.schema.properties.connections.maxItems, 496)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
