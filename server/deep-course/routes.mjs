import { randomUUID } from 'node:crypto'
import express from 'express'
import { getCurrentRunTree, traceable } from 'langsmith/traceable'
import { mergeRevisedTeachingPlan, validateTeachingPlan } from '../lesson-plan.mjs'
import { createFirstCheckpoint, diagnoseTurn, openingDiagnosticQuestion, runDeepPlan } from './engine.mjs'
import { Workspace, defaultProjectId, paths, sourceId } from './workspace.mjs'

const MAX_PAGES = 300
const MAX_TEXT_CHARS = 1_500_000
const JOB_TTL_MS = 30 * 60_000
const SOURCE_KINDS = ['topic', 'pdf', 'text', 'markdown', 'web', 'image', 'audio', 'video', 'slides', 'spreadsheet', 'code']

/** Tags a LangSmith run while it is still open (no-op when tracing is off). */
function tagRun(metadata) {
  try {
    const run = getCurrentRunTree()
    run.extra = { ...run.extra, metadata: { ...(run.extra?.metadata || {}), ...metadata } }
  } catch { /* not inside a traced run */ }
}

function parseRequest(body) {
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const pageCount = Number(body?.pageCount)
  if (!title || !text || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_PAGES) return { error: 'A title, page count, and extracted text are required.' }
  if (text.length > MAX_TEXT_CHARS) return { error: 'The extracted text exceeds the 1.5 million character limit.', status: 413 }
  const knowledge = Array.isArray(body?.knowledge) ? body.knowledge.slice(0, 100).flatMap(item =>
    item && typeof item.concept === 'string' && ['clear', 'partial', 'review'].includes(item.status) ? [{ concept: item.concept.trim().slice(0, 120), status: item.status }] : []) : []
  const projectId = typeof body?.projectId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(body.projectId) ? body.projectId : defaultProjectId(text)
  return {
    title, text, pageCount, knowledge, projectId,
    evidence: Array.isArray(body?.evidence) ? body.evidence.slice(0, 50) : [],
    priorKnowledge: body?.priorKnowledge && typeof body.priorKnowledge === 'object' ? body.priorKnowledge : null,
    goal: typeof body?.learningGoal === 'string' ? body.learningGoal.trim().slice(0, 1000) : '',
    sourceKind: SOURCE_KINDS.includes(body?.sourceKind) ? body.sourceKind : 'text',
    languageLevel: Number.isInteger(body?.languageLevel) && body.languageLevel >= 1 && body.languageLevel <= 10 ? body.languageLevel : undefined,
  }
}

/**
 * Hybrid planning endpoints.
 *   POST /fast               checkpoint 1 now, plus a background job id for checkpoints 2..N
 *   GET  /jobs/:id           background job status; includes the plan when done
 *   POST /jobs/:id/merge     merges the background plan into the learner's current plan, never touching checkpoint 1
 */
export function createCourseRouter({ openAIKey, model, readerModel, dataDir, exaApiKey = () => process.env.EXA_API_KEY?.trim(), exaBudget = 5, engine = { createFirstCheckpoint, runDeepPlan, diagnoseTurn } }) {
  const router = express.Router()
  const jobs = new Map()

  function startJob({ userId, workspace, request, sid }) {
    // One background job per learner, project and source at a time.
    for (const [id, job] of jobs) {
      if (job.userId === userId && job.projectId === workspace.projectId && job.sid === sid && job.status === 'running') return id
    }
    const id = randomUUID()
    const job = { id, userId, projectId: workspace.projectId, sid, status: 'running', stage: 'starting', detail: null, plan: null, error: '', stats: null, startedAt: Date.now() }
    jobs.set(id, job)
    const run = traceable(async () => {
      const result = await engine.runDeepPlan({
        apiKey: openAIKey(), model, readerModel, ...request, workspace, exaApiKey: exaApiKey(), exaBudget,
        onProgress: (stage, detail) => { job.stage = stage; job.detail = detail ?? null },
      })
      tagRun({ escalation_triggered: Boolean(result.stats?.escalationTriggered) })
      return result
    }, { name: 'deep-course-plan', tags: ['deep_agent'], metadata: { project_id: workspace.projectId, source_id: sid, lane: 'deep_agent' } })
    run().then(result => {
      Object.assign(job, { status: 'done', stage: 'done', plan: result.plan, stats: result.stats, finishedAt: Date.now() })
    }, error => {
      Object.assign(job, { status: 'failed', stage: 'failed', error: error instanceof Error ? error.message : 'The background plan could not be built.', finishedAt: Date.now() })
    })
    return id
  }

  function prune() {
    const now = Date.now()
    for (const [id, job] of jobs) if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id)
  }

  function ownedJob(req, res) {
    prune()
    const job = jobs.get(req.params.id)
    if (!job || job.userId !== String(req.user?.id)) { res.status(404).json({ error: 'That planning job was not found.' }); return null }
    return job
  }

  router.post('/fast', async (req, res) => {
    const request = parseRequest(req.body)
    if (request.error) return res.status(request.status || 400).json({ error: request.error })
    try {
      const workspace = new Workspace({ dataDir, userId: req.user.id, projectId: request.projectId })
      const sid = sourceId(request.text)
      // Same source, already planned once: checkpoint 1 comes from the workspace with no model call.
      let plan = null
      const saved = await workspace.readJson(paths.checkpoint1(sid))
      try { plan = saved ? validateTeachingPlan(saved, request.pageCount) : null } catch { plan = null }
      if (!plan) {
        plan = await traceable(() => engine.createFirstCheckpoint({ apiKey: openAIKey(), model, ...request, workspace }), {
          name: 'fast-path', tags: ['fast_path'], metadata: { project_id: request.projectId, source_id: sid, lane: 'fast_path' },
        })()
        // The planner bridges from this file, so it is saved before the background job starts.
        await workspace.write(paths.checkpoint1(sid), plan)
      }
      const jobId = startJob({ userId: String(req.user.id), workspace, request, sid })
      res.json({ plan, jobId, projectId: request.projectId, cached: Boolean(saved && plan === saved) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The first checkpoint could not be planned.'
      res.status(/OPENAI_API_KEY/.test(message) ? 503 : /timed out|abort/i.test(message) ? 504 : 502).json({ error: message })
    }
  })

  // Diagnostic conversation. With no turns yet it returns the opening question instantly, with no model call.
  router.post('/diagnose', async (req, res) => {
    const request = parseRequest(req.body)
    if (request.error) return res.status(request.status || 400).json({ error: request.error })
    const turns = Array.isArray(req.body?.turns) ? req.body.turns.slice(-10).flatMap(turn =>
      turn && ['tutor', 'learner'].includes(turn.role) && typeof turn.text === 'string' && turn.text.trim() ? [{ role: turn.role, text: turn.text.trim().slice(0, 1000) }] : []) : []
    if (!turns.some(turn => turn.role === 'learner')) return res.json({ done: false, question: openingDiagnosticQuestion(request.title), lastAnswerSignal: 'neutral', signalReason: '', summary: '' })
    const languageGuide = typeof req.body?.languageGuide === 'string' ? req.body.languageGuide.slice(0, 600) : ''
    try {
      const result = await traceable(() => (engine.diagnoseTurn || diagnoseTurn)({ apiKey: openAIKey(), model, ...request, turns, languageGuide }), {
        name: 'diagnostic-agent', tags: ['diagnostic'], metadata: { project_id: request.projectId, lane: 'diagnostic' },
      })()
      res.json(result)
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'The diagnostic agent could not respond.' })
    }
  })

  // The diagnostic usually finishes while the background team is still reading: hand its findings to the planner.
  router.post('/jobs/:id/learner', async (req, res) => {
    const job = ownedJob(req, res)
    if (!job) return
    const level = Number(req.body?.languageLevel)
    const summary = typeof req.body?.diagnosticSummary === 'string' ? req.body.diagnosticSummary.slice(0, 1200) : ''
    if (!Number.isInteger(level) || level < 1 || level > 10) return res.status(400).json({ error: 'A language level from 1 to 10 is required.' })
    try {
      const workspace = new Workspace({ dataDir, userId: job.userId, projectId: job.projectId })
      const record = (await workspace.readJson(paths.learner())) || {}
      await workspace.write(paths.learner(), { ...record, updatedAt: new Date().toISOString(), languageLevel: level, diagnosticSummary: summary })
      res.json({ ok: true, plannerStillRunning: job.status === 'running' })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'The learner record could not be updated.' })
    }
  })

  router.get('/jobs/:id', (req, res) => {
    const job = ownedJob(req, res)
    if (!job) return
    res.json({ id: job.id, status: job.status, stage: job.stage, detail: job.detail, stats: job.stats, error: job.error || undefined, plan: job.status === 'done' ? job.plan : undefined })
  })

  router.post('/jobs/:id/merge', (req, res) => {
    const job = ownedJob(req, res)
    if (!job) return
    if (job.status !== 'done') return res.status(409).json({ error: 'The rest of the plan is not ready yet.', status: job.status })
    const current = req.body?.currentPlan
    const completedCount = Number(req.body?.completedCount)
    const pageCount = Number(req.body?.pageCount)
    if (!current || !Array.isArray(current.sessions) || !current.sessions.length || !Number.isInteger(completedCount) || completedCount < 0 || !Number.isInteger(pageCount)) {
      return res.status(400).json({ error: 'The current plan, completed checkpoint count and page count are required.' })
    }
    try {
      validateTeachingPlan(current, pageCount)
      // Keep checkpoint 1 even while it is still in progress, and anything else already completed.
      const keep = Math.min(current.sessions.length, Math.max(1, completedCount))
      res.json(validateTeachingPlan(mergeRevisedTeachingPlan(current, job.plan, keep), pageCount))
    } catch (error) {
      res.status(422).json({ error: error instanceof Error ? error.message : 'The plans could not be merged.' })
    }
  })

  return router
}
