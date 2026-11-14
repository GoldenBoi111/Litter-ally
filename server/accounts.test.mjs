import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { createAuth, rejectCrossSite } from './auth.mjs'
import { createLibraryRouter, libraryPaths, runMaintenance } from './library.mjs'

async function startApp() {
  const dataDir = await mkdtemp(join(tmpdir(), 'litterally-'))
  const app = express()
  app.use(rejectCrossSite)
  const auth = await createAuth({ dataDir })
  app.use('/api/auth', auth.router)
  app.use('/api', auth.requireUser)
  app.use('/api/library', createLibraryRouter({ dataDir }))
  const server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { dataDir, base, close: async () => { server.close(); await rm(dataDir, { recursive: true, force: true }) } }
}

/** A tiny client that keeps its session cookie, like a browser tab. */
function client(base) {
  let cookie = ''
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body instanceof Uint8Array ? body : body !== undefined ? JSON.stringify(body) : undefined,
    })
    const set = response.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const type = response.headers.get('content-type') || ''
    return { status: response.status, body: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()), setCookie: set }
  }
}

test('registration signs in, stores only a password hash, and rejects duplicates and weak input', async t => {
  const app = await startApp(); t.after(app.close)
  const call = client(app.base)
  assert.equal((await call('/api/auth/register', { method: 'POST', body: { email: 'bad', password: 'longenough' } })).status, 400)
  assert.equal((await call('/api/auth/register', { method: 'POST', body: { email: 'a@b.co', password: 'short' } })).status, 400)
  const created = await call('/api/auth/register', { method: 'POST', body: { email: 'Ada@Example.com', password: 'correct horse', name: 'Ada' } })
  assert.equal(created.status, 201)
  assert.match(created.setCookie, /HttpOnly; SameSite=Lax/)
  assert.deepEqual((await call('/api/auth/me')).body.user, { id: created.body.user.id, email: 'ada@example.com', name: 'Ada' })
  const stored = await readFile(join(app.dataDir, 'users.json'), 'utf8')
  assert.ok(!stored.includes('correct horse'))
  assert.equal((await client(app.base)('/api/auth/register', { method: 'POST', body: { email: 'ada@example.com', password: 'another one' } })).status, 409)
})

test('login checks the password, logout ends the session, and repeated failures are throttled', async t => {
  const app = await startApp(); t.after(app.close)
  await client(app.base)('/api/auth/register', { method: 'POST', body: { email: 'ada@example.com', password: 'correct horse' } })
  const call = client(app.base)
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'ada@example.com', password: 'wrong horse' } })).status, 401)
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'wrong horse' } })).status, 401)
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'ada@example.com', password: 'correct horse' } })).status, 200)
  assert.equal((await call('/api/library/papers')).status, 200)
  await call('/api/auth/logout', { method: 'POST' })
  assert.equal((await call('/api/library/papers')).status, 401)
  const attacker = client(app.base)
  for (let i = 0; i < 8; i++) await attacker('/api/auth/login', { method: 'POST', body: { email: 'ada@example.com', password: `guess ${i}` } })
  assert.equal((await attacker('/api/auth/login', { method: 'POST', body: { email: 'ada@example.com', password: 'correct horse' } })).status, 429)
})

test('cross-site writes are refused', async t => {
  const app = await startApp(); t.after(app.close)
  const response = await client(app.base)('/api/auth/register', { method: 'POST', body: { email: 'a@b.co', password: 'longenough' }, headers: { origin: 'https://evil.example' } })
  assert.equal(response.status, 403)
})

test("each user sees only their own sources and files, and ids can't escape the data folder", async t => {
  const app = await startApp(); t.after(app.close)
  const ada = client(app.base), bob = client(app.base)
  await ada('/api/auth/register', { method: 'POST', body: { email: 'ada@example.com', password: 'correct horse' } })
  await bob('/api/auth/register', { method: 'POST', body: { email: 'bob@example.com', password: 'correct horse' } })
  assert.equal((await ada('/api/library/papers/p1/blobs/pdfData', { method: 'PUT', body: new Uint8Array([1, 2, 3]) })).status, 200)
  assert.equal((await ada('/api/library/papers/p1', { method: 'PUT', body: { paper: { id: 'p1', title: 'Mine', blobTypes: { pdfData: 'application/pdf' } } } })).status, 200)
  assert.deepEqual((await ada('/api/library/papers')).body.papers.map(p => p.title), ['Mine'])
  assert.deepEqual([...(await ada('/api/library/papers/p1/blobs/pdfData')).body], [1, 2, 3])
  assert.deepEqual((await bob('/api/library/papers')).body.papers, [])
  assert.equal((await bob('/api/library/papers/p1/blobs/pdfData')).status, 404)
  assert.equal((await ada('/api/library/papers/..%2F..%2Fusers', { method: 'PUT', body: { paper: { id: '../../users' } } })).status, 400)
  assert.equal((await ada('/api/library/papers/p1/blobs/..%2Fx')).status, 400)
})

test('stale revisions are rejected so concurrent learning writes cannot overwrite each other', async t => {
  const app = await startApp(); t.after(app.close)
  const call = client(app.base)
  await call('/api/auth/register', { method: 'POST', body: { email: 'ada@example.com', password: 'correct horse' } })
  await call('/api/library/papers/p1', { method: 'PUT', body: { paper: { id: 'p1' } } })
  const write = (paperRev, knowledgeRev) => call('/api/library/learning-write', { method: 'POST', body: { paperId: 'p1', paper: { id: 'p1' }, paperRev, knowledge: { graph: { nodes: [], edges: [] } }, knowledgeRev } })
  assert.deepEqual((await write(1, 0)).body, { paperRev: 2, knowledgeRev: 1 })
  assert.equal((await write(1, 0)).status, 409)
  assert.equal((await call('/api/library/papers/p1', { method: 'PUT', body: { paper: { id: 'p1' }, rev: 1 } })).status, 409)
})

test('maintenance removes stale temp files, orphaned files and lesson canvases of deleted sources', async t => {
  const app = await startApp(); t.after(app.close)
  const call = client(app.base)
  const { user } = (await call('/api/auth/register', { method: 'POST', body: { email: 'ada@example.com', password: 'correct horse' } })).body
  await call('/api/library/papers/kept', { method: 'PUT', body: { paper: { id: 'kept' } } })
  for (const key of ['margin-board-v1', 'margin-paper-v2-kept', 'margin-paper-v2-gone']) await call(`/api/library/canvases/${key}`, { method: 'PUT', body: { snapshot: {} } })
  const p = libraryPaths(app.dataDir, user.id)
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
  await mkdir(p.blobs('gone'), { recursive: true }); await utimes(p.blobs('gone'), old, old)
  await mkdir(p.blobs('importing'), { recursive: true })
  await writeFile(join(p.root, 'knowledge.json.abc.tmp'), 'x'); await utimes(join(p.root, 'knowledge.json.abc.tmp'), old, old)
  assert.deepEqual(await runMaintenance(app.dataDir), { temp: 1, blobs: 1, canvases: 1 })
  assert.ok(await stat(p.blobs('importing')))
  assert.ok(await stat(p.canvas('margin-board-v1')))
  assert.ok(await stat(p.canvas('margin-paper-v2-kept')))
})
