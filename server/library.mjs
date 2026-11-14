import { readdir, rm, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import express from 'express'
import { SAFE_ID, readJson, withLock, writeAtomic, writeJson } from './disk.mjs'

const BLOB_NAME = /^(pdfData|sourceData|frame-\d{1,4})$/
const MAX_BLOB_BYTES = 30 * 1024 * 1024
const EMPTY_KNOWLEDGE = { rev: 0, graph: { nodes: [], edges: [] }, learner: { evidence: [] } }

/**
 * Per-user files on disk:
 *   users/<userId>/papers/<paperId>.json   source record (no binary data) with a `rev` counter
 *   users/<userId>/blobs/<paperId>/<name>  PDFs, media and video frames
 *   users/<userId>/knowledge.json          learning map + learner evidence, with `rev`
 *   users/<userId>/canvases/<key>.json     tldraw snapshots for the board and each lesson
 * Every write for one user runs under that user's lock, so a revision check and its write can't interleave.
 */
export function libraryPaths(dataDir, userId) {
  const root = join(dataDir, 'users', userId)
  return {
    root,
    papers: join(root, 'papers'),
    paper: id => join(root, 'papers', `${id}.json`),
    blobs: id => join(root, 'blobs', id),
    blob: (id, name) => join(root, 'blobs', id, name),
    knowledge: join(root, 'knowledge.json'),
    canvases: join(root, 'canvases'),
    canvas: key => join(root, 'canvases', `${key}.json`),
  }
}

const conflict = (res, current) => res.status(409).json({ error: 'This was changed elsewhere. Reload and try again.', current })

export function createLibraryRouter({ dataDir }) {
  const router = express.Router()
  const json = express.json({ limit: '60mb' })
  const paths = req => libraryPaths(dataDir, req.user.id)
  const userLock = (req, fn) => withLock(`user:${req.user.id}`, fn)

  router.param('id', (req, res, next, id) => SAFE_ID.test(id) ? next() : res.status(400).json({ error: 'Invalid id.' }))
  router.param('key', (req, res, next, key) => SAFE_ID.test(key) ? next() : res.status(400).json({ error: 'Invalid canvas key.' }))
  router.param('name', (req, res, next, name) => BLOB_NAME.test(name) ? next() : res.status(400).json({ error: 'Invalid file name.' }))

  router.get('/papers', async (req, res) => {
    const dir = paths(req).papers
    const files = await readdir(dir).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))
    const papers = await Promise.all(files.filter(name => name.endsWith('.json')).map(name => readJson(join(dir, name), null)))
    res.json({ papers: papers.filter(Boolean) })
  })

  router.get('/papers/:id', async (req, res) => {
    const paper = await readJson(paths(req).paper(req.params.id), null)
    paper ? res.json({ paper }) : res.status(404).json({ error: 'This source is no longer in your library.' })
  })

  router.put('/papers/:id', json, (req, res) => userLock(req, async () => {
    const { paper, rev } = req.body || {}
    if (!paper || typeof paper !== 'object' || paper.id !== req.params.id) return res.status(400).json({ error: 'Send the source record with a matching id.' })
    const current = await readJson(paths(req).paper(req.params.id), null)
    if (rev !== undefined && (current?.rev || 0) !== rev) return conflict(res, current)
    const next = { ...paper, rev: (current?.rev || 0) + 1 }
    await writeJson(paths(req).paper(req.params.id), next)
    res.json({ rev: next.rev })
  }))

  router.delete('/papers/:id', (req, res) => userLock(req, async () => {
    await rm(paths(req).paper(req.params.id), { force: true })
    await rm(paths(req).blobs(req.params.id), { recursive: true, force: true })
    res.json({ ok: true })
  }))

  // Binary data is uploaded before its record, so a failed import leaves only an orphan for maintenance to sweep, never a record pointing at nothing.
  router.put('/papers/:id/blobs/:name', express.raw({ type: () => true, limit: MAX_BLOB_BYTES }), (req, res) => userLock(req, async () => {
    if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Send the file as the request body.' })
    await writeAtomic(paths(req).blob(req.params.id, req.params.name), req.body)
    res.json({ ok: true })
  }))

  router.get('/papers/:id/blobs/:name', async (req, res) => {
    const paper = await readJson(paths(req).paper(req.params.id), null)
    const file = paths(req).blob(req.params.id, req.params.name)
    if (!paper || !(await stat(file).catch(() => null))) return res.status(404).json({ error: 'That file is missing.' })
    res.type(paper.blobTypes?.[req.params.name] || 'application/octet-stream')
    createReadStream(file).pipe(res)
  })

  router.get('/knowledge', async (req, res) => res.json(await readJson(paths(req).knowledge, EMPTY_KNOWLEDGE)))

  /** One learning step updates a source and the learning map together; both revisions must still match or nothing is written. */
  router.post('/learning-write', json, (req, res) => userLock(req, async () => {
    const { paperId, paper, paperRev, knowledge, knowledgeRev } = req.body || {}
    if (!SAFE_ID.test(String(paperId)) || paper?.id !== paperId || !knowledge?.graph) return res.status(400).json({ error: 'Send the source, the learning map and their revisions.' })
    const p = paths(req)
    const currentPaper = await readJson(p.paper(paperId), null)
    if (!currentPaper) return res.status(404).json({ error: 'This source is no longer in your library.' })
    const currentKnowledge = await readJson(p.knowledge, EMPTY_KNOWLEDGE)
    if ((currentPaper.rev || 0) !== paperRev || currentKnowledge.rev !== knowledgeRev) return conflict(res)
    const nextKnowledge = { rev: currentKnowledge.rev + 1, graph: knowledge.graph, learner: knowledge.learner || currentKnowledge.learner }
    await writeJson(p.paper(paperId), { ...paper, rev: (currentPaper.rev || 0) + 1 })
    await writeJson(p.knowledge, nextKnowledge)
    res.json({ paperRev: (currentPaper.rev || 0) + 1, knowledgeRev: nextKnowledge.rev })
  }))

  router.get('/canvases/:key', async (req, res) => res.json({ snapshot: await readJson(paths(req).canvas(req.params.key), null) }))

  router.put('/canvases/:key', json, (req, res) => userLock(req, async () => {
    if (!req.body?.snapshot || typeof req.body.snapshot !== 'object') return res.status(400).json({ error: 'Send a canvas snapshot.' })
    await writeJson(paths(req).canvas(req.params.key), req.body.snapshot)
    res.json({ ok: true })
  }))

  router.delete('/canvases/:key', (req, res) => userLock(req, async () => {
    await rm(paths(req).canvas(req.params.key), { force: true })
    res.json({ ok: true })
  }))

  return router
}

const LESSON_CANVAS = /^margin-paper-v2-(.+)$/
const STALE_TEMP_MS = 60 * 60 * 1000

async function list(dir) {
  return readdir(dir, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))
}

/** Sweeps what interrupted writes and deletions leave behind: stale temp files, files for deleted sources, and canvases of deleted lessons. */
export async function runMaintenance(dataDir) {
  const removed = { temp: 0, blobs: 0, canvases: 0 }
  async function sweepTemp(dir) {
    for (const entry of await list(dir)) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await sweepTemp(path)
      else if (entry.name.endsWith('.tmp') && Date.now() - (await stat(path)).mtimeMs > STALE_TEMP_MS) { await rm(path, { force: true }); removed.temp++ }
    }
  }
  await sweepTemp(dataDir)
  for (const user of await list(join(dataDir, 'users'))) {
    if (!user.isDirectory() || !SAFE_ID.test(user.name)) continue
    const p = libraryPaths(dataDir, user.name)
    await withLock(`user:${user.name}`, async () => {
      const live = new Set((await list(p.papers)).filter(e => e.name.endsWith('.json')).map(e => e.name.slice(0, -5)))
      for (const dir of await list(join(p.root, 'blobs'))) {
        if (!live.has(dir.name)) { await rm(join(p.root, 'blobs', dir.name), { recursive: true, force: true }); removed.blobs++ }
      }
      for (const file of await list(p.canvases)) {
        const lesson = file.name.replace(/\.json$/, '').match(LESSON_CANVAS)
        if (lesson && !live.has(lesson[1])) { await rm(join(p.canvases, file.name), { force: true }); removed.canvases++ }
      }
    })
  }
  return removed
}
