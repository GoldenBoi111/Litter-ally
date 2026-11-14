import test from 'node:test'
import assert from 'node:assert/strict'
import { speechChunks } from './speech-chunks.mjs'

const LIMIT = 900 // the local Qwen TTS host rejects longer inputs with HTTP 400

test('short text is spoken in one piece', () => {
  assert.deepEqual(speechChunks('Hello there. What do you know about attention?'), ['Hello there. What do you know about attention?'])
})

test('long diagnostic text is split at sentence boundaries under the TTS limit without losing words', () => {
  const sentence = 'Attention lets a model weigh every word against every other word in the sentence. '
  const text = sentence.repeat(14).trim() // ~1150 characters, under the 1200 the route accepts
  const chunks = speechChunks(text)
  assert.ok(chunks.length >= 2)
  for (const chunk of chunks) { assert.ok(chunk.length <= LIMIT, `chunk of ${chunk.length}`); assert.match(chunk, /\.$/) }
  assert.equal(chunks.join(' '), text)
})

test('a single sentence longer than the limit is split on spaces', () => {
  const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
  const chunks = speechChunks(text)
  for (const chunk of chunks) assert.ok(chunk.length <= LIMIT)
  assert.equal(chunks.join(' '), text)
})
