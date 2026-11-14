import test from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeQuestion } from './learning.mjs'

const page = { pageNumber: 4, text: '[Page 4 of 7]\nThe intervention improved recall after one week.' }
const input = {
  apiKey: 'test-key', model: 'test-model', paperTitle: 'A paper',
  checkpoint: { title: 'Results', goal: 'Explain the measured effect.', concepts: ['Recall'], sourcePages: [4] },
  paperEvidence: [page], knowledge: [], previousQuestions: [],
}

function mockResponse(value) {
  return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }), { status: 200 })
}

test('practice question uses supplied paper excerpts and retains their page citations', async () => {
  const previousFetch = globalThis.fetch
  let request
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body)
    return mockResponse({ question: 'Why did recall remain higher after one week?', concepts: ['Recall'], hint: 'Compare the groups.', sourcePages: [4] })
  }
  try {
    const result = await createPracticeQuestion(input)
    assert.match(request.input, /\[Page 4 of 7\]/)
    assert.deepEqual(result.sourcePages, [4])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('practice question rejects citations outside the supplied paper excerpts', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => mockResponse({ question: 'Why did recall remain higher after one week?', concepts: ['Recall'], hint: 'Compare the groups.', sourcePages: [5] })
  try {
    await assert.rejects(createPracticeQuestion(input), /invalid practice question/)
  } finally {
    globalThis.fetch = previousFetch
  }
})
