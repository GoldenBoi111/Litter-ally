import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import express from 'express'
import { createExaBroker } from './deep-course/exa-broker.mjs'
import { splitPages, tooLong } from './deep-course/engine.mjs'
import { createCourseRouter } from './deep-course/routes.mjs'
import { Workspace, paths } from './deep-course/workspace.mjs'

async function tempWorkspace(t, owner = 'user1', project = 'proj1') {
  const dataDir = await mkdtemp(join(tmpdir(), 'deep-course-'))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  return { dataDir, workspace: new Workspace({ dataDir, userId: owner, projectId: project }) }
}

function fakeExa() {
  const calls = []
  const fetchImpl = async (_url, init) => {
    calls.push(JSON.parse(init.body).query)
    await new Promise(r => setTimeout(r, 20))
    return { ok: true, json: async () => ({ results: [{ title: 'Explainer', url: 'https://www.nature.com/articles/x', highlights: ['A clear definition.'] }] }) }
  }
  return { calls, fetchImpl }
}

test('workspace keeps every path inside its project folder', async t => {
  const { workspace } = await tempWorkspace(t)
  await workspace.write('/notes/a.md', 'hello')
  assert.equal(await workspace.read('/notes/a.md'), 'hello')
  assert.equal(await workspace.read('/notes/missing.md'), null)
  assert.throws(() => workspace.file('/../../escape.txt'), /escapes the workspace/)
  assert.throws(() => new Workspace({ dataDir: '/tmp', userId: '../x', projectId: 'p' }), /Invalid/)
})

test('a reader gets one search, then is told to escalate', async t => {
  const { workspace } = await tempWorkspace(t)
  const exa = fakeExa()
  const broker = createExaBroker({ apiKey: 'k', workspace, budget: 5, fetchImpl: exa.fetchImpl })
  const search = broker.readerTool('reader-1')
  assert.match(await search.invoke({ concept: 'mycorrhizal networks' }), /Explainer/)
  assert.match(await search.invoke({ concept: 'carbon allocation' }), /LIMIT_ESCALATION/)
  assert.equal(exa.calls.length, 1)
})

test('parallel readers asking the same thing cost one API call, and later asks hit the disk cache', async t => {
  const { workspace } = await tempWorkspace(t)
  const exa = fakeExa()
  const broker = createExaBroker({ apiKey: 'k', workspace, budget: 5, fetchImpl: exa.fetchImpl })
  const results = await Promise.all(['a', 'b', 'c'].map(id => broker.readerTool(id).invoke({ concept: 'Nitrogen fixation' })))
  assert.equal(exa.calls.length, 1)
  assert.ok(results.every(r => r.includes('Explainer')))
  assert.ok(await workspace.read(paths.ref('Nitrogen fixation')))
  // A new job on the same project reuses the cached reference without spending budget.
  const again = createExaBroker({ apiKey: 'k', workspace, budget: 5, fetchImpl: exa.fetchImpl })
  await again.readerTool('d').invoke({ concept: 'nitrogen fixation' })
  assert.equal(exa.calls.length, 1)
  assert.equal(again.stats.cacheHits, 1)
})

test('coordinator escalations stop at the project budget and report what is left unresolved', async t => {
  const { workspace } = await tempWorkspace(t)
  const exa = fakeExa()
  const broker = createExaBroker({ apiKey: 'k', workspace, budget: 2, fetchImpl: exa.fetchImpl })
  const result = await broker.resolve(['alpha concept', 'beta concept', 'Alpha Concept', 'gamma concept'])
  assert.equal(exa.calls.length, 2)
  assert.equal(result.resolved.length, 2)
  assert.deepEqual(result.unresolved, ['gamma concept'])
  assert.equal(result.budgetLeft, 0)
})

test('without an Exa key nothing is called', async t => {
  const { workspace } = await tempWorkspace(t)
  const exa = fakeExa()
  const broker = createExaBroker({ apiKey: '', workspace, fetchImpl: exa.fetchImpl })
  assert.match(await broker.readerTool('r').invoke({ concept: 'photosynthesis' }), /LIMIT_ESCALATION/)
  assert.equal(exa.calls.length, 0)
})

test('pages split on their markers; only context-size errors count as too long', () => {
  assert.deepEqual(splitPages('[Page 1 of 2]\nfirst\n[Page 2 of 2]\nsecond', 2), ['first', 'second'])
  assert.deepEqual(splitPages('no markers', 1), ['no markers'])
  assert.ok(tooLong(new Error("This model's maximum context length is 128000 tokens")))
  assert.ok(!tooLong(new Error('Rate limit exceeded, retry in 2s')))
})

// ---- routes, with a stub engine so no model is called ----

const concept = (id, page) => ({ id, name: id, explanation: `About ${id}.`, sourcePages: [page], prerequisites: [] })
const session = (title, ids, page) => ({ title, minutes: 10, goal: 'g', concepts: ids, conceptIds: ids, activities: [], narration: 'n'.repeat(160), sourcePages: [page], pageFocus: 'p', diagrams: [], checkForUnderstanding: 'c', backgroundNotes: '', backgroundSources: [] })
const firstPlan = { title: 'T', conceptMap: [concept('roots', 1)], sessions: [session('One', ['roots'], 1)] }
const restPlan = { title: 'T', conceptMap: [concept('trade', 2), concept('feed', 3)], sessions: [session('Two', ['trade'], 2), session('Three', ['feed'], 3)] }

async function server(t, engine) {
  const { dataDir } = await tempWorkspace(t)
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.user = { id: req.get('x-user') || 'user1' }; next() })
  app.use('/api/course', createCourseRouter({ openAIKey: () => 'k', model: 'm', dataDir, exaApiKey: () => '', engine }))
  const listener = app.listen(0)
  t.after(() => listener.close())
  const base = `http://127.0.0.1:${listener.address().port}/api/course`
  const call = (path, body, user = 'user1') => fetch(base + path, body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-user': user }, body: JSON.stringify(body) } : { headers: { 'x-user': user } }).then(async r => ({ status: r.status, body: await r.json() }))
  return { call }
}

const source = { title: 'Forests', text: '[Page 1 of 3]\na\n[Page 2 of 3]\nb\n[Page 3 of 3]\nc', pageCount: 3 }

test('fast path returns checkpoint 1 at once and the background plan merges in after it', async t => {
  let release
  const gate = new Promise(r => { release = r })
  const { call } = await server(t, {
    createFirstCheckpoint: async () => structuredClone(firstPlan),
    runDeepPlan: async () => { await gate; return { plan: structuredClone(restPlan), stats: { escalationTriggered: false } } },
  })
  const fast = await call('/fast', source)
  assert.equal(fast.status, 200)
  assert.equal(fast.body.plan.sessions.length, 1)
  assert.equal((await call(`/jobs/${fast.body.jobId}`)).body.status, 'running')
  assert.equal((await call(`/jobs/${fast.body.jobId}/merge`, { currentPlan: fast.body.plan, completedCount: 0, pageCount: 3 })).status, 409)

  release()
  await new Promise(r => setTimeout(r, 20))
  assert.equal((await call(`/jobs/${fast.body.jobId}`)).body.status, 'done')
  // Checkpoint 1 is still in progress (completedCount 0) and must survive the merge untouched.
  const merged = await call(`/jobs/${fast.body.jobId}/merge`, { currentPlan: fast.body.plan, completedCount: 0, pageCount: 3 })
  assert.equal(merged.status, 200)
  assert.deepEqual(merged.body.sessions.map(s => s.title), ['One', 'Two', 'Three'])
  assert.deepEqual(merged.body.sessions[0], fast.body.plan.sessions[0])
})

test('another learner cannot read or merge someone else\'s job, and repeat requests share one job', async t => {
  const { call } = await server(t, {
    createFirstCheckpoint: async () => structuredClone(firstPlan),
    runDeepPlan: () => new Promise(() => {}),
  })
  const a = await call('/fast', source)
  const b = await call('/fast', source)
  assert.equal(a.body.jobId, b.body.jobId)
  assert.equal(b.body.cached, true, 'checkpoint 1 for a known source comes from the workspace')
  assert.equal((await call(`/jobs/${a.body.jobId}`, null, 'intruder')).status, 404)
  assert.equal((await call(`/jobs/${a.body.jobId}/merge`, { currentPlan: firstPlan, completedCount: 0, pageCount: 3 }, 'intruder')).status, 404)
})

test('bad requests are refused before any model call', async t => {
  let calls = 0
  const { call } = await server(t, { createFirstCheckpoint: async () => { calls++; return firstPlan }, runDeepPlan: async () => ({ plan: restPlan, stats: {} }) })
  assert.equal((await call('/fast', { title: 'x', text: 'y', pageCount: 0 })).status, 400)
  assert.equal(calls, 0)
})

// ---- the real deepagents coordinator, scripted with a fake model ----

import { AIMessage } from '@langchain/core/messages'
import { fakeModel } from 'langchain'
import { runDeepPlan } from './deep-course/engine.mjs'
import { sourceId } from './deep-course/workspace.mjs'

function stubSteps(log) {
  return {
    dispatchReaders: async job => { log.push('readers'); job.readerSummary = { slices: 2, read: 2, cached: 0, missingConcepts: ['isotope labelling'] }; return job.readerSummary },
    runSynthesis: async () => { log.push('synthesis'); return { throughLine: 'Trees share resources.' } },
    runPlanner: async job => { log.push('planner'); await job.workspace.write(`/plan/source_${job.sid}_teaching_plan.json`, restPlan); return restPlan },
  }
}

test('the coordinator deep agent drives readers, escalation, then the synthesis and planner subagents in order', async t => {
  const { workspace } = await tempWorkspace(t)
  const log = []
  const coordinatorModel = fakeModel()
    .respondWithTools([{ name: 'dispatch_readers', args: {}, id: 'c1' }])
    .respondWithTools([{ name: 'resolve_missing_concepts', args: { concepts: ['isotope labelling'] }, id: 'c2' }])
    .respondWithTools([{ name: 'task', args: { subagent_type: 'synthesis', description: 'Synthesise the notes.' }, id: 'c3' }])
    .respondWithTools([{ name: 'task', args: { subagent_type: 'planner', description: 'Plan checkpoints 2..N.' }, id: 'c4' }])
    .respond(new AIMessage('The plan is ready.'))
  const stages = []
  const result = await runDeepPlan({
    apiKey: 'unused', model: 'unused', title: source.title, text: source.text, pageCount: 3, workspace,
    exaApiKey: '', coordinatorModel, steps: stubSteps(log), onProgress: stage => stages.push(stage),
  })
  assert.deepEqual(log, ['readers', 'synthesis', 'planner'])
  assert.ok(stages.includes('escalation'), 'the escalated concept went to the coordinator')
  assert.equal(result.stats.escalationTriggered, true)
  assert.deepEqual(result.plan.sessions.map(s => s.title), ['Two', 'Three'])
  assert.ok(await workspace.read('/learner/learner_record.json'), 'the learner record is in shared memory for the planner')
  // The subagents ran through the task tool: their summaries came back to the coordinator.
  const lastCall = coordinatorModel.calls.at(-1).messages.map(m => String(m.content)).join('\n')
  assert.match(lastCall, /Plan written to/)
})

test('if the coordinator fails, the plan is still finished in code', async t => {
  const { workspace } = await tempWorkspace(t)
  const log = []
  const result = await runDeepPlan({
    apiKey: 'unused', model: 'unused', title: source.title, text: source.text, pageCount: 3, workspace,
    exaApiKey: '', coordinatorModel: fakeModel().alwaysThrow(new Error('model unavailable')), steps: stubSteps(log),
  })
  assert.deepEqual(log, ['readers', 'planner'])
  assert.equal(result.plan.sessions.length, 2)
  assert.ok(await workspace.read(`/plan/source_${sourceId(source.text)}_teaching_plan.json`))
})

test('readers fan out in parallel, re-split an oversized slice, cache their notes, and a second run reuses them', async t => {
  const { workspace } = await tempWorkspace(t)
  const pageCount = 20
  const text = Array.from({ length: pageCount }, (_, i) => `[Page ${i + 1} of ${pageCount}]\nPage ${i + 1} explains one step of the argument.`).join('\n')
  const calls = []
  let inFlight = 0, maxInFlight = 0
  const structuredCall = async ({ name }) => {
    calls.push(name)
    if (name.startsWith('source-reader')) {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise(r => setTimeout(r, 15))
      inFlight--
      if (name === 'source-reader-002') throw new Error("This model's maximum context length is 128000 tokens")
      return { notes: `Notes for ${name}: the slice argues one step [p. 1].`, keyConcepts: [{ name: 'step', summary: 'A step.', pages: [1] }], missingConcepts: name === 'source-reader-001' ? ['isotope labelling'] : [] }
    }
    if (name === 'synthesis') return { throughLine: 'One argument in steps.', synthesis: 'The steps build on each other, from the first [p. 1] to the last [p. 20]. '.repeat(2) }
    if (name === 'planner') return structuredClone(restPlan)
    throw new Error(`unexpected ${name}`)
  }
  const script = () => fakeModel()
    .respondWithTools([{ name: 'dispatch_readers', args: {}, id: 'a' }])
    .respondWithTools([{ name: 'task', args: { subagent_type: 'synthesis', description: 'Synthesise.' }, id: 'b' }])
    .respondWithTools([{ name: 'task', args: { subagent_type: 'planner', description: 'Plan.' }, id: 'c' }])
    .respond(new AIMessage('Ready.'))

  const first = await runDeepPlan({ apiKey: 'x', model: 'x', title: 'Steps', text, pageCount, workspace, exaApiKey: '', coordinatorModel: script(), structuredCall })
  const readers = calls.filter(c => c.startsWith('source-reader'))
  assert.deepEqual(readers.sort(), ['source-reader-001', 'source-reader-002', 'source-reader-002a', 'source-reader-002b', 'source-reader-003'])
  assert.ok(maxInFlight >= 2, 'slices are read in parallel')
  assert.deepEqual(first.stats.resplit, ['002'])
  assert.deepEqual(first.stats.missingConcepts, ['isotope labelling'])
  assert.equal(first.plan.sessions.length, 2)
  const sid = sourceId(text)
  assert.ok(await workspace.read(`/notes/source_${sid}_chunk_002a_notes.md`), 'each half writes its own notes file')
  assert.match(await workspace.read(`/notes/source_${sid}_synthesis.md`), /Through-line/)

  calls.length = 0
  const second = await runDeepPlan({ apiKey: 'x', model: 'x', title: 'Steps', text, pageCount, workspace, exaApiKey: '', coordinatorModel: script(), structuredCall })
  assert.ok(calls.length && calls.every(c => c === 'planner'), 'a known source re-plans from cached notes and synthesis: no reader or synthesis calls')
  assert.equal(second.stats.cached, 3)
})

import { checkRemainingPlan } from './deep-course/engine.mjs'

test('later checkpoints may build on checkpoint 1 concepts; prerequisites to unknown concepts are dropped', () => {
  const later = structuredClone(restPlan)
  later.conceptMap[0].prerequisites = [
    { id: 'roots', reason: 'Needs the network first.', evidencePages: [1], relationType: 'explicit' },
    { id: 'ghost', reason: 'Not a real concept.', evidencePages: [1], relationType: 'inferred' },
  ]
  const checked = checkRemainingPlan(later, structuredClone(firstPlan), 3)
  assert.deepEqual(checked.conceptMap[0].prerequisites.map(p => p.id), ['roots'], 'the link back to checkpoint 1 is kept')
  const alone = checkRemainingPlan(structuredClone(later), null, 3)
  assert.deepEqual(alone.conceptMap[0].prerequisites, [], 'without checkpoint 1 the link is unknown, so it is dropped rather than failing the plan')
})

test('the planner gets one retry naming the pages it left out, and the better plan wins', async t => {
  const { workspace } = await tempWorkspace(t)
  const pageCount = 6
  const text = Array.from({ length: pageCount }, (_, i) => `[Page ${i + 1} of ${pageCount}]\nPage ${i + 1}.`).join('\n')
  const sid = sourceId(text)
  await workspace.write(`/plan/source_${sid}_checkpoint_1.json`, firstPlan)
  const prompts = []
  const narrow = structuredClone(restPlan)
  const full = structuredClone(restPlan)
  full.sessions[0].sourcePages = [2, 4]; full.sessions[1].sourcePages = [6]
  let planner = 0
  const structuredCall = async ({ name, user }) => {
    if (name.startsWith('source-reader')) return { notes: 'Notes for the slice [p. 1].', keyConcepts: [], missingConcepts: [] }
    if (name === 'synthesis') return { throughLine: 'x', synthesis: 'y'.repeat(100) }
    prompts.push(user); return planner++ === 0 ? narrow : full
  }
  const stages = []
  const result = await runDeepPlan({ apiKey: 'x', model: 'x', title: 'Six', text, pageCount, workspace, exaApiKey: '', structuredCall,
    coordinatorModel: fakeModel().alwaysThrow(new Error('use the code path')), onProgress: stage => stages.push(stage) })
  assert.equal(planner, 2)
  assert.match(prompts[0], /Pages still to cover.*2, 3, 4, 5, 6/)
  assert.match(prompts[1], /left out pages 5, 6/)
  assert.ok(stages.includes('replanning'))
  assert.deepEqual(result.plan.sessions.flatMap(s => s.sourcePages).sort(), [2, 4, 6])
})

import { repairPageCitations } from './deep-course/engine.mjs'

test('citations to pages that do not exist are repaired instead of failing the plan', () => {
  const plan = structuredClone(restPlan)
  plan.sessions[0].sourcePages = [2, 40]
  plan.sessions[1].sourcePages = [0, 99]
  plan.conceptMap[1].prerequisites = [{ id: 'trade', reason: 'r', evidencePages: [77], relationType: 'explicit' }]
  repairPageCitations(plan, 3, 2)
  assert.deepEqual(plan.sessions.map(s => s.sourcePages), [[2], [2]])
  assert.deepEqual(plan.conceptMap[1].prerequisites, [], 'a prerequisite with no real evidence is dropped')
})

import { DIAGNOSTIC_MAX_QUESTIONS, diagnoseTurn } from './deep-course/engine.mjs'

test('the diagnostic opens instantly with no model call, then hands each answer to the agent', async t => {
  const seen = []
  const { call } = await server(t, {
    createFirstCheckpoint: async () => structuredClone(firstPlan),
    runDeepPlan: () => new Promise(() => {}),
    diagnoseTurn: async ({ turns, languageGuide }) => { seen.push({ turns, languageGuide }); return { lastAnswerSignal: 'struggled', signalReason: 'asked what a term means', done: false, question: 'What do you think a fungus gets from a tree?', summary: '' } },
  })
  const opening = await call('/diagnose', { ...source, turns: [] })
  assert.equal(opening.status, 200)
  assert.match(opening.body.question, /Forests/)
  assert.equal(seen.length, 0, 'no model call for the opening question')
  const next = await call('/diagnose', { ...source, languageGuide: 'Language level 5/10.', turns: [{ role: 'tutor', text: opening.body.question }, { role: 'learner', text: 'What does mycorrhizal mean?' }] })
  assert.equal(next.body.lastAnswerSignal, 'struggled')
  assert.equal(seen[0].languageGuide, 'Language level 5/10.')
})

test('the diagnostic stops after the maximum number of questions even if the model wants more', async () => {
  const turns = Array.from({ length: DIAGNOSTIC_MAX_QUESTIONS }, (_, i) => [{ role: 'tutor', text: `Q${i}` }, { role: 'learner', text: `A${i}` }]).flat()
  const result = await diagnoseTurn({ apiKey: 'x', model: 'x', title: 'T', text: source.text, pageCount: 3, turns, languageGuide: '',
    structuredCall: async () => ({ lastAnswerSignal: 'understood', signalReason: '', done: false, question: 'One more?', summary: 'Knows the basics.' }) })
  assert.equal(result.done, true)
  assert.equal(result.question, '')
})

test('the diagnostic summary and level reach the planner\'s learner record, for the job owner only', async t => {
  const { call } = await server(t, { createFirstCheckpoint: async () => structuredClone(firstPlan), runDeepPlan: () => new Promise(() => {}) })
  const fast = await call('/fast', { ...source, projectId: 'learner-proj' })
  assert.equal((await call(`/jobs/${fast.body.jobId}/learner`, { languageLevel: 3, diagnosticSummary: 'New to ecology.' }, 'intruder')).status, 404)
  assert.equal((await call(`/jobs/${fast.body.jobId}/learner`, { languageLevel: 11 })).status, 400)
  const ok = await call(`/jobs/${fast.body.jobId}/learner`, { languageLevel: 3, diagnosticSummary: 'New to ecology.' })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.plannerStillRunning, true)
})
