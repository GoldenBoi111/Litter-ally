import test from 'node:test'
import assert from 'node:assert/strict'
import { searchLessonImage } from './visual-search.mjs'

test('Exa finds a Commons file and the image keeps its source and credit', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push(String(url))
    if (calls.length === 1) {
      assert.equal(JSON.parse(options.body).includeDomains[0], 'commons.wikimedia.org')
      return Response.json({ results: [{ title: 'File: Example diagram.svg', url: 'https://commons.wikimedia.org/wiki/File:Example_diagram.svg' }] })
    }
    if (calls.length === 2) return Response.json({ query: { pages: [{ imageinfo: [{
      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/example.png',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example_diagram.svg',
      extmetadata: { Artist: { value: '<b>Ada</b>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' } },
    }] }] } })
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
  }
  const image = await searchLessonImage({ apiKey: 'test', query: 'photosynthesis', fetchImpl })
  assert.equal(calls.length, 3)
  assert.equal(image.title, 'Example diagram.svg')
  assert.equal(image.credit, 'Ada')
  assert.equal(image.license, 'CC BY-SA 4.0')
  assert.equal(image.licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0/')
  assert.equal(image.sourceUrl, 'https://commons.wikimedia.org/wiki/File:Example_diagram.svg')
  assert.equal(image.mimeType, 'image/png')
})

test('ignores non-Commons pages and untrusted image hosts', async () => {
  let calls = 0
  const fetchImpl = async () => {
    calls++
    if (calls === 1) return Response.json({ results: [
      { url: 'https://example.com/wiki/File:Private.svg' },
      { url: 'https://commons.wikimedia.org/wiki/File:Public.svg' },
    ] })
    return Response.json({ query: { pages: [{ imageinfo: [{ thumburl: 'https://example.com/private.png' }] }] } })
  }
  assert.equal(await searchLessonImage({ apiKey: 'test', query: 'example', fetchImpl }), null)
  assert.equal(calls, 2)
})
