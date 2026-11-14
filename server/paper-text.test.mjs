import test from 'node:test'
import assert from 'node:assert/strict'
import { readPaperEvidence, readPaperPage } from '../src/paper-text.mjs'

test('returns only the requested page and bounds the model context', () => {
  const text = `[Page 1]\nFirst page\n\n[Page 2]\n${'x'.repeat(12_010)}\n\n[Page 3]\nThird page`
  assert.equal(readPaperPage(text, 1, 3), '[Page 1 of 3]\nFirst page')
  const second = readPaperPage(text, 2, 3)
  assert.equal(second.length < 12_100, true)
  assert.match(second, /\[Page text truncated\.\]$/)
  assert.doesNotMatch(second, /Third page/)
})

test('reports invalid, missing, and empty page text without exposing another page', () => {
  const text = '[Page 1]\n\n[Page 2]\nAvailable text'
  assert.match(readPaperPage(text, 3, 2), /between 1 and 2/)
  assert.match(readPaperPage(text, 4, 4), /unavailable/)
  assert.match(readPaperPage(text, 1, 2), /No readable text/)
})

test('returns only readable, unique excerpts for requested source pages', () => {
  const text = '[Page 1]\nFirst page\n\n[Page 2]\n\n[Page 3]\nThird page'
  assert.deepEqual(readPaperEvidence(text, [3, 2, 3], 3), [{ pageNumber: 3, text: '[Page 3 of 3]\nThird page' }])
})
