import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { transformWithOxc } from 'vite'
import { createAuth } from './auth.mjs'
import { createLibraryRouter } from './library.mjs'

const source = readFileSync(new URL('../src/storage.ts', import.meta.url), 'utf8')
const compiled = (await transformWithOxc(source, 'src/storage.ts')).code
const { saveLearningOutcome, savePaper, toLearningSource } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('recovers page segments from a legacy PDF with an empty segment list', () => {
  const source = toLearningSource({
    id: 'legacy', title: 'Legacy PDF', sourceKind: 'pdf', sourceSegments: [], pageCount: 2,
    text: '[Page 1]\nFirst page\n\n[Page 2]\nSecond page', importedAt: '2026-01-01',
  })
  assert.deepEqual(source.segments.map(segment => segment.text), ['First page', 'Second page'])
})

test('concurrent learning writes merge against the latest persisted graph', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'litterally-'))
  const app = express()
  const auth = await createAuth({ dataDir })
  app.use('/api/auth', auth.router)
  app.use('/api', auth.requireUser)
  app.use('/api/library', createLibraryRouter({ dataDir }))
  const server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const previousFetch = globalThis.fetch
  t.after(async () => { globalThis.fetch = previousFetch; server.close(); await rm(dataDir, { recursive: true, force: true }) })

  const registered = await previousFetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse' }) })
  const cookie = registered.headers.get('set-cookie').split(';')[0]
  // The browser module calls relative URLs with the session cookie; point it at this server.
  globalThis.fetch = (path, init = {}) => previousFetch(base + path, { ...init, headers: { ...init.headers, cookie } })
  globalThis.window ??= { dispatchEvent() {} }

  await savePaper({ id: 'paper', title: 'Paper', sourceUrl: '', pdfUrl: '', fileName: '', pageCount: 1, characterCount: 1, text: 'x', importedAt: new Date().toISOString(), sourceKind: 'text', sourceSegments: [], learningState: { assessments: {}, practice: [] } })
  const addProposition = id => graph => ({
    ...graph,
    propositions: [...(graph.propositions || []), { id, concept: id, statement: id, sources: [] }],
  })
  await Promise.all([
    saveLearningOutcome('paper', addProposition('from-tab-a'), state => state),
    saveLearningOutcome('paper', addProposition('from-tab-b'), state => state),
  ])
  const saved = (await (await globalThis.fetch('/api/library/knowledge')).json()).graph.propositions.map(item => item.id).sort()
  assert.deepEqual(saved, ['from-tab-a', 'from-tab-b'])
})
