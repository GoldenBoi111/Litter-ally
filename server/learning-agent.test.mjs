import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

let nextResult
let lastAgentOptions
let lastAgentInput
let lastInvokeOptions

mock.module('@langchain/openai', {
  namedExports: {
    ChatOpenAI: class {
      constructor(options) { this.options = options }
    },
  },
})
mock.module('deepagents', {
  namedExports: {
    createFilesystemMiddleware: options => ({ options }),
    createDeepAgent: options => {
      lastAgentOptions = options
      return {
        invoke: async (input, invokeOptions) => {
          lastAgentInput = input
          lastInvokeOptions = invokeOptions
          return nextResult
        },
      }
    },
  },
})
let lastPlainAgentOptions
mock.module('langchain', {
  namedExports: {
    tool: (invoke, options) => ({ ...options, invoke }),
    createAgent: options => {
      lastPlainAgentOptions = options
      return { invoke: async (input, invokeOptions) => { lastAgentInput = input; lastInvokeOptions = invokeOptions; return nextResult } }
    },
  },
})

const { createBackgroundSearchTool, createLearningDiagnostic, extractTaughtKnowledge, isReputableSourceUrl } = await import('./learning-agent.mjs')

test('planner agent gets small sources inline without file tools and uses low reasoning', async () => {
  nextResult = { structuredResponse: { goal: 'ignored', questions: [
    { concept: 'mechanism', question: 'Why does the mechanism change the outcome?' },
    { concept: 'evidence', question: 'What evidence supports the main result?' },
  ] } }

  const result = await createLearningDiagnostic({
    apiKey: 'test-key', model: 'gpt-6-luna', title: 'Sample', text: '[Page 1 of 3]\nFirst page\n\n[Page 2 of 3]\nSecond page\n\n[Page 3 of 3]\nThird page', pageCount: 3,
  })

  assert.equal(result.goal, 'Understand the main ideas of the selected material and how they work.')
  // Small sources go inline to a plain agent: no file tools, no files in state.
  assert.equal(lastAgentInput.files, undefined)
  assert.equal(lastInvokeOptions.recursionLimit, 20)
  assert.deepEqual(lastPlainAgentOptions.model.options.reasoning, { effort: 'low' })
  const firstMessage = lastAgentInput.messages[0].content
  assert.match(firstMessage, /already fully read/)
  assert.match(firstMessage, /\[Page 2 of 3\]\nSecond page/)
})

test('background search keeps only reputable https citations and stops after four searches', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (_url, options) => {
    calls += 1
    const request = JSON.parse(options.body)
    assert.deepEqual(options.headers['x-api-key'], 'test-key')
    assert.deepEqual(request.includeDomains.includes('nih.gov'), true)
    assert.deepEqual(request.includeDomains.includes('*.edu'), true)
    return new Response(JSON.stringify({ results: [
      { url: 'https://www.nature.com/articles/example', title: 'Nature source', highlights: ['Useful background.'] },
      { url: 'https://nature.com.attacker.example/article', title: 'Untrusted source', highlights: ['Untrusted.'] },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  try {
    const sources = new Map()
    const search = createBackgroundSearchTool('test-key', sources)
    let result
    for (let index = 0; index < 4; index++) result = JSON.parse(await search.invoke({ query: 'foundational mechanism concept' }))
    const capped = await search.invoke({ query: 'foundational mechanism concept' })
    assert.match(result.note, /Nature source: Useful background/)
    assert.deepEqual(result.sources.map(source => source.url), ['https://www.nature.com/articles/example'])
    assert.equal(sources.size, 1)
    assert.match(capped, /Search limit reached/)
    assert.equal(calls, 4)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('taught knowledge rejects page citations outside the checkpoint', async () => {
  nextResult = { structuredResponse: { propositions: [{
    id: 'mechanism', name: 'Mechanism', statement: 'The mechanism changes the outcome.', aliases: [], existingId: null, sourcePages: [3],
  }], chains: [] } }

  await assert.rejects(extractTaughtKnowledge({
    apiKey: 'test-key', model: 'gpt-6-luna', title: 'Sample', text: '[Page 2]\nEvidence', pageCount: 3,
    checkpoint: { title: 'Mechanism', sourcePages: [2] }, teacherTranscript: 'The tutor explained the mechanism clearly in enough detail.', priorKnowledge: { propositions: [], chains: [] },
  }), /outside the current lesson context/)
})

test('source filter accepts reputable academic hosts and rejects lookalikes', () => {
  assert.equal(isReputableSourceUrl('https://pmc.ncbi.nlm.nih.gov/articles/PMC123/'), true)
  assert.equal(isReputableSourceUrl('https://nih.gov.attacker.example/article'), false)
  assert.equal(isReputableSourceUrl('http://nih.gov/article'), false)
})

test('pages are grouped into batches by count and size', async () => {
  const { batchPages } = await import('./learning-agent.mjs')
  assert.deepEqual(batchPages(Array.from({ length: 20 }, () => 'x')).map(b => b.path), [
    '/paper/batches/pages-001-008.txt', '/paper/batches/pages-009-016.txt', '/paper/batches/pages-017-020.txt',
  ])
  assert.equal(batchPages(['a'.repeat(20_000), 'b'.repeat(20_000), 'c']).length, 2)
})

test('large sources keep batched read-only files on the deep agent', async () => {
  nextResult = { structuredResponse: { goal: 'ignored', questions: [
    { concept: 'a', question: 'Why does the mechanism change the outcome?' },
    { concept: 'b', question: 'What evidence supports the main result?' },
  ] } }
  const page = 'word '.repeat(6000)
  const text = Array.from({ length: 6 }, (_, i) => `[Page ${i + 1} of 6]\n${page}`).join('\n\n')
  await createLearningDiagnostic({ apiKey: 'k', model: 'gpt-6-luna', title: 'Big', text, pageCount: 6 })
  assert.ok(lastAgentInput.files['/paper/source-index.txt'])
  assert.match(lastAgentInput.files['/paper/batches/pages-001-004.txt'].content[0], /^\[Page 1 of 6\]/)
  assert.equal(lastAgentOptions.middleware[0].options.permissions[0].operations[0], 'read')
  assert.deepEqual(lastAgentOptions.model.options.reasoning, { effort: 'low' })
})
