import test from 'node:test'
import assert from 'node:assert/strict'
import { searchBackground } from './deep-course/exa-broker.mjs'

test('outside lookups send the key server-side, stay on reputable sites, and return short cited excerpts', async () => {
  let sent
  const fetchImpl = async (url, init) => {
    sent = { url, headers: init.headers, body: JSON.parse(init.body) }
    return new Response(JSON.stringify({ results: [
      { title: 'Energy storage basics', url: 'https://www.eia.gov/storage', highlights: ['Round-trip efficiency is the share of energy returned.'] },
      { title: 'Random blog', url: 'https://example-blog.com/post', highlights: ['Unvetted claim.'] },
    ] }), { status: 200 })
  }
  const results = await searchBackground({ apiKey: 'test-key', query: 'What is round-trip efficiency?', fetchImpl })
  assert.equal(sent.url, 'https://api.exa.ai/search')
  assert.equal(sent.headers['x-api-key'], 'test-key')
  assert.ok(sent.body.includeDomains.length > 0, 'searches are restricted to reputable domains')
  assert.deepEqual(results, [{ title: 'Energy storage basics', url: 'https://www.eia.gov/storage', excerpt: 'Round-trip efficiency is the share of energy returned.' }])
})

test('a failed outside lookup reports the HTTP status instead of returning nothing', async () => {
  const fetchImpl = async () => new Response('{}', { status: 401 })
  await assert.rejects(searchBackground({ apiKey: 'bad', query: 'x', fetchImpl }), /HTTP 401/)
})
