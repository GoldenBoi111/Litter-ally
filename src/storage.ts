import type { TeachingPlan } from './lessonAgent'
import type { AnswerReview, LearningStatus } from './learning'

/** `status` fields on older nodes are retained on read for IndexedDB compatibility. */
export type KnowledgeNode = { id: string; concept: string; status?: LearningStatus; updatedAt?: string; sources?: string[] }
export type KnowledgeEdge = { id: string; source: string; target: string; label: string }
export type SourceLocator =
  | { kind: 'pdf-page'; page: number }
  | { kind: 'section'; heading?: string; anchor?: string; startLine?: number; endLine?: number }
  | { kind: 'image-region'; x?: number; y?: number; width?: number; height?: number }
  | { kind: 'time-range'; startSeconds: number; endSeconds: number; frameSeconds?: number }
  | { kind: 'slide'; slide: number }
  | { kind: 'spreadsheet-range'; sheet: string; range: string }
  | { kind: 'code-range'; path: string; startLine: number; endLine: number }
export function formatSourceLocator(locator: SourceLocator) {
  switch (locator.kind) {
    case 'pdf-page': return `page ${locator.page}`
    case 'section': return locator.heading || (locator.startLine ? `lines ${locator.startLine}-${locator.endLine || locator.startLine}` : 'section')
    case 'image-region': return locator.x === undefined ? 'image' : `image region ${locator.x},${locator.y || 0}`
    case 'time-range': return `${Math.floor(locator.startSeconds)}-${Math.ceil(locator.endSeconds)} sec`
    case 'slide': return `slide ${locator.slide}`
    case 'spreadsheet-range': return `${locator.sheet}!${locator.range}`
    case 'code-range': return `${locator.path}:${locator.startLine}-${locator.endLine}`
  }
}
export type SourceSegment = { id: string; text: string; locator: SourceLocator; mediaType?: string; sourceId?: string; sourceTitle?: string }
export type SourceRef = { sourceId: string; sourceTitle?: string; segmentId?: string; locator: SourceLocator }
export type LearningSource = { id: string; title: string; kind: 'pdf' | 'text' | 'markdown' | 'web' | 'image' | 'audio' | 'video' | 'slides' | 'spreadsheet' | 'code' | 'topic'; origin: string; segments: SourceSegment[]; importedAt: string }
export type KnowledgeProvenance = { sourceId?: string; sourceTitle?: string; refs?: SourceLocator[]; sourceRefs?: SourceRef[]; checkpoint?: string; kind?: 'planned' | 'taught'; /** Legacy data retained until old library records are migrated. */ paperId: string; paperTitle: string; pages: number[] }
export type KnowledgeProposition = { id: string; concept: string; statement: string; aliases?: string[]; sources: KnowledgeProvenance[] }
export type KnowledgeReasoningLink = { id: string; source: string; target: string; relationType: 'explicit' | 'inferred'; reason: string; evidence: KnowledgeProvenance[] }
export type KnowledgeReasoningChain = { id: string; premises: string[]; conclusion: string; reason: string; sources: KnowledgeProvenance[] }
export type KnowledgeGraph = { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; propositions?: KnowledgeProposition[]; reasoningLinks?: KnowledgeReasoningLink[]; chains?: KnowledgeReasoningChain[] }
export type ExtractedKnowledgeUpdate = {
  propositions: Array<{ id: string; name: string; statement: string; aliases: string[]; existingId: string | null; sourcePages: number[] }>
  chains: Array<{ premises: string[]; conclusion: string; reason: string; sourcePages: number[] }>
}
export type LearningEvidence = { question: string; answer: string; feedback: string; concepts: Array<{ concept: string; status: LearningStatus }>; source: string; sourceId?: string; sourceTitle?: string; sourceRefs?: SourceRef[]; /** Legacy paper citations remain readable during migration. */ sourcePages?: number[]; reviewedAt: string }
export type LearningProfile = { evidence: LearningEvidence[] }
export type LearningState = {
  assessments: Record<string, AnswerReview>
  practice: Array<{ question: string; answer?: string; review: AnswerReview; sourcePages?: number[]; reviewedAt: string }>
  evidence?: LearningEvidence[]
}

export function knowledgeNodeId(concept: string) {
  return concept.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
}

export function latestConceptEvidence(evidence: LearningEvidence[]) {
  const latest = new Map<string, { concept: string; status: LearningStatus }>()
  for (const item of [...evidence].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))) {
    for (const result of item.concepts) {
      const id = knowledgeNodeId(result.concept)
      if (id && !latest.has(id)) latest.set(id, { concept: result.concept, status: result.status })
    }
  }
  return [...latest.values()]
}

export type ImportedPaper = {
  id: string
  title: string
  sourceUrl: string
  pdfUrl: string
  fileName: string
  pageCount: number
  characterCount: number
  text: string
  pdfData?: Blob
  ocrUsed?: boolean
  learningState?: LearningState
  lessonState?: { plan: TeachingPlan; checkpointIndex: number; sourceIds?: string[] }
  importedAt: string
  sourceKind?: LearningSource['kind']
  sourceSegments?: SourceSegment[]
  sourceData?: Blob
  sourceFrames?: Array<{ timeSeconds: number; data: Blob }>
}

export function toLearningSource(record: ImportedPaper): LearningSource {
  const segments: SourceSegment[] = record.sourceSegments || Array.from({ length: record.pageCount }, (_, index): SourceSegment | null => {
    const page = index + 1
    const marker = new RegExp(`^\\[Page ${page}(?: of \\d+)?\\]\\s*$`, 'm')
    const start = record.text.search(marker)
    if (start < 0) return null
    const bodyStart = start + record.text.slice(start).match(marker)![0].length
    const next = record.text.slice(bodyStart).search(/^\[Page \d+(?: of \d+)?\]\s*$/m)
    return { id: `${record.id}:page:${page}`, text: record.text.slice(bodyStart, next < 0 ? undefined : bodyStart + next).trim(), locator: { kind: 'pdf-page' as const, page } }
  }).filter(segment => segment !== null)
  return { id: record.id, title: record.title, kind: record.sourceKind || 'pdf', origin: record.sourceUrl || record.fileName, segments, importedAt: record.importedAt }
}

const LEGACY_DB_NAME = 'margin-library'
const STORE_NAME = 'papers'
const KNOWLEDGE_STORE = 'knowledge'
const LIBRARY = '/api/library'
const EMPTY_GRAPH: KnowledgeGraph = { nodes: [], edges: [] }

export function paperCanvasPersistenceKey(paperId: string) {
  return `margin-paper-v2-${paperId}`
}

/** Fired when the server says the session is gone, so the app can show sign-in instead of failing quietly. */
export const SIGNED_OUT_EVENT = 'litterally:signed-out'

export async function checkApiResponse(response: Response | Promise<Response>, service = 'The server'): Promise<Response> {
  const result = await response
  if (result.status === 401) window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
  if (!result.ok) {
    const failure = await result.json().catch(() => ({}))
    throw Object.assign(new Error(failure.error || `${service} returned HTTP ${result.status}.`), { status: result.status })
  }
  return result
}

export async function readApiJson<T>(response: Response | Promise<Response>, service = 'The server'): Promise<T> {
  return (await checkApiResponse(response, service)).json() as Promise<T>
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  return readApiJson<T>(fetch(path, {
    ...rest,
    credentials: 'same-origin',
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  }))
}

const isConflict = (error: unknown) => (error as { status?: number })?.status === 409

type BinaryParts = Pick<ImportedPaper, 'pdfData' | 'sourceData' | 'sourceFrames'>
type StoredPaper = Omit<ImportedPaper, keyof BinaryParts> & { rev?: number; blobTypes?: Record<string, string>; sourceFrames?: Array<{ timeSeconds: number }> }

// Binary parts stay in memory after loading so record-only server writes can hand callers back a complete paper.
const binaries = new Map<string, BinaryParts>()
const uploaded = new WeakSet<Blob>()

function splitBinary(paper: ImportedPaper) {
  const { pdfData, sourceData, sourceFrames, ...record } = paper
  const files: Array<[string, Blob]> = []
  if (pdfData) files.push(['pdfData', pdfData])
  if (sourceData) files.push(['sourceData', sourceData])
  sourceFrames?.forEach((frame, index) => files.push([`frame-${index}`, frame.data]))
  const stored: StoredPaper = {
    ...record,
    blobTypes: Object.fromEntries(files.map(([name, blob]) => [name, blob.type || 'application/octet-stream'])),
    ...(sourceFrames ? { sourceFrames: sourceFrames.map(frame => ({ timeSeconds: frame.timeSeconds })) } : {}),
  }
  return { stored, files, parts: { pdfData, sourceData, sourceFrames } as BinaryParts }
}

function withBinary(stored: StoredPaper): ImportedPaper {
  const { rev: _rev, blobTypes: _types, sourceFrames: _frames, ...record } = stored
  const parts = binaries.get(stored.id) || {}
  return { ...record, ...Object.fromEntries(Object.entries(parts).filter(([, value]) => value !== undefined)) } as ImportedPaper
}

async function loadBinary(stored: StoredPaper) {
  const fetchBlob = async (name: string) => {
    const response = await checkApiResponse(fetch(`${LIBRARY}/papers/${stored.id}/blobs/${name}`, { credentials: 'same-origin' }), `Could not load a file for "${stored.title}"`)
    const blob = await response.blob()
    uploaded.add(blob)
    return blob
  }
  const types = stored.blobTypes || {}
  const parts: BinaryParts = {}
  if (types.pdfData) parts.pdfData = await fetchBlob('pdfData')
  if (types.sourceData) parts.sourceData = await fetchBlob('sourceData')
  if (stored.sourceFrames?.length) parts.sourceFrames = await Promise.all(stored.sourceFrames.map(async (frame, index) => ({ timeSeconds: frame.timeSeconds, data: await fetchBlob(`frame-${index}`) })))
  binaries.set(stored.id, parts)
}

export async function deletePaperCanvas(paperId: string, _onBlocked?: () => void): Promise<void> {
  await api(`${LIBRARY}/canvases/${paperCanvasPersistenceKey(paperId)}`, { method: 'DELETE' })
}

export async function loadCanvas<T>(key: string): Promise<T | null> {
  return (await api<{ snapshot: T | null }>(`${LIBRARY}/canvases/${key}`)).snapshot
}

export async function saveCanvas(key: string, snapshot: unknown): Promise<void> {
  await api(`${LIBRARY}/canvases/${key}`, { method: 'PUT', json: { snapshot } })
}

type KnowledgeDoc = { rev: number; graph: KnowledgeGraph; learner: LearningProfile }
const loadKnowledge = () => api<KnowledgeDoc>(`${LIBRARY}/knowledge`)
const loadStoredPapers = async () => (await api<{ papers: StoredPaper[] }>(`${LIBRARY}/papers`)).papers

export async function loadKnowledgeGraph(): Promise<KnowledgeGraph> {
  return (await loadKnowledge()).graph || EMPTY_GRAPH
}

export async function loadLearningProfile(): Promise<LearningProfile> {
  const [papers, knowledge] = await Promise.all([loadStoredPapers(), loadKnowledge()])
  const evidence = papers.flatMap(paper => (paper.learningState?.evidence || []).map(item => ({
    ...item, sourceId: item.sourceId || paper.id, sourceTitle: item.sourceTitle || paper.title,
  })))
  const byReview = new Map<string, LearningEvidence>()
  for (const item of [...evidence, ...(knowledge.learner?.evidence || [])]) {
    byReview.set(`${item.sourceId || item.sourceTitle || item.source}:${item.reviewedAt}:${item.question}:${item.answer}`, item)
  }
  return { evidence: [...byReview.values()].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt)).slice(-200) }
}

type LearningWrite = { paper: ImportedPaper; graph: KnowledgeGraph; profile?: LearningProfile }
type GraphUpdate = (graph: KnowledgeGraph) => KnowledgeGraph
const MAX_WRITE_ATTEMPTS = 6

/** Reads the latest source and learning map, applies the updates, and writes both only if neither changed meanwhile; otherwise retries on fresh data. */
async function updatePaperAndKnowledge(paperId: string, updateGraph: GraphUpdate, updatePaper: (paper: ImportedPaper) => ImportedPaper, updateProfile?: (profile: LearningProfile) => LearningProfile): Promise<LearningWrite> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const [{ paper: stored }, knowledge] = await Promise.all([api<{ paper: StoredPaper }>(`${LIBRARY}/papers/${paperId}`), loadKnowledge()])
    const updatedPaper = updatePaper(withBinary(stored))
    const graph = updateGraph(knowledge.graph || EMPTY_GRAPH)
    const profile = updateProfile?.(knowledge.learner || { evidence: [] })
    const { stored: record } = splitBinary(updatedPaper)
    try {
      await api(`${LIBRARY}/learning-write`, { method: 'POST', json: { paperId, paper: { ...record, blobTypes: stored.blobTypes, sourceFrames: stored.sourceFrames }, paperRev: stored.rev || 0, knowledge: { graph, learner: profile }, knowledgeRev: knowledge.rev } })
      return { paper: updatedPaper, graph, ...(profile ? { profile } : {}) }
    } catch (error) {
      if (!isConflict(error)) throw error
    }
  }
  throw new Error('Your learning progress kept changing in another tab. Reload and try again.')
}

export function saveLearningOutcome(paperId: string, updateGraph: GraphUpdate, update: (state: LearningState) => LearningState, updateProfile?: (profile: LearningProfile) => LearningProfile): Promise<LearningWrite> {
  return updatePaperAndKnowledge(paperId, updateGraph, paper => ({
    ...paper, learningState: update(paper.learningState || { assessments: {}, practice: [] }),
  }), updateProfile)
}

export function saveLearningPlan(paper: ImportedPaper, plan: TeachingPlan, updateGraph: GraphUpdate, resetAssessments: boolean, checkpointIndex = 0, sourceIds?: string[]): Promise<LearningWrite> {
  return updatePaperAndKnowledge(paper.id, updateGraph, saved => {
    const learningState = saved.learningState || { assessments: {}, practice: [] }
    return {
      ...saved,
      lessonState: { plan, checkpointIndex, sourceIds: sourceIds?.length ? sourceIds : [paper.id] },
      ...(resetAssessments ? { learningState: { ...learningState, assessments: {} } } : {}),
    }
  })
}

function refsForPages(pages: number[], segments?: SourceSegment[]) {
  return pages.map(page => segments?.[page - 1]?.locator || { kind: 'pdf-page' as const, page })
}

function sourceRefsForPages(pages: number[], paperId: string, paperTitle: string, segments?: SourceSegment[]): SourceRef[] {
  return pages.flatMap(page => {
    const segment = segments?.[page - 1]
    return [{ sourceId: segment?.sourceId || paperId, sourceTitle: segment?.sourceTitle || paperTitle, ...(segment ? { segmentId: segment.id } : {}), locator: segment?.locator || { kind: 'pdf-page' as const, page } }]
  })
}

export function recordPlanKnowledge(graph: KnowledgeGraph, plan: TeachingPlan, paperId: string, paperTitle: string, segments?: SourceSegment[]): KnowledgeGraph {
  const propositions = new Map((graph.propositions || []).map(item => [item.id, item]))
  const reasoningLinks = new Map((graph.reasoningLinks || []).map(item => [item.id, item]))
  const ids = new Map((plan.conceptMap || []).map(item => [item.id, knowledgeNodeId(item.name)]))
  for (const item of plan.conceptMap || []) {
    const id = ids.get(item.id)!
    if (!id) continue
    const previous = propositions.get(id)
    const checkpoint = plan.sessions.find(session => session.conceptIds?.includes(item.id))?.title
    const source = { sourceId: paperId, sourceTitle: paperTitle, refs: refsForPages(item.sourcePages, segments), sourceRefs: sourceRefsForPages(item.sourcePages, paperId, paperTitle, segments), paperId, paperTitle, pages: item.sourcePages, checkpoint, kind: 'planned' as const }
    const sources = [...(previous?.sources || []).filter(entry => (entry.sourceId || entry.paperId) !== paperId || entry.kind !== 'planned'), source]
    propositions.set(id, { id, concept: item.name, statement: item.explanation, sources })
    for (const link of item.prerequisites) {
      const prerequisiteId = ids.get(link.id)
      if (!prerequisiteId) continue
      const edgeId = `${prerequisiteId}:${id}:${link.relationType || 'inferred'}`
      const edge = reasoningLinks.get(edgeId)
      reasoningLinks.set(edgeId, {
        id: edgeId, source: prerequisiteId, target: id,
        relationType: link.relationType || 'inferred', reason: link.reason,
        evidence: [...(edge?.evidence || []).filter(entry => entry.paperId !== paperId), { sourceId: paperId, sourceTitle: paperTitle, refs: refsForPages(link.evidencePages || [], segments), sourceRefs: sourceRefsForPages(link.evidencePages || [], paperId, paperTitle, segments), paperId, paperTitle, pages: link.evidencePages || [] }],
      })
    }
  }
  return { ...graph, propositions: [...propositions.values()], reasoningLinks: [...reasoningLinks.values()] }
}

export function mergeTaughtKnowledge(graph: KnowledgeGraph, update: ExtractedKnowledgeUpdate, source: { paperId: string; paperTitle: string; checkpoint: string; segments?: SourceSegment[] }): KnowledgeGraph {
  const { segments, ...sourceRef } = source
  const propositions = new Map((graph.propositions || []).map(item => [item.id, item]))
  const aliases = new Map<string, string>()
  for (const item of update.propositions) {
    const id = item.existingId && propositions.has(item.existingId) ? item.existingId : knowledgeNodeId(item.name)
    if (!id) continue
    aliases.set(item.id, id)
    const previous = propositions.get(id)
    const sourceRecord = { sourceId: source.paperId, sourceTitle: source.paperTitle, refs: refsForPages(item.sourcePages, segments), sourceRefs: sourceRefsForPages(item.sourcePages, source.paperId, source.paperTitle, segments), ...sourceRef, pages: item.sourcePages, kind: 'taught' as const }
    const sources = [...(previous?.sources || []).filter(entry => (entry.sourceId || entry.paperId) !== source.paperId || entry.checkpoint !== source.checkpoint || entry.kind !== 'taught'), sourceRecord]
    propositions.set(id, {
      id, concept: previous?.concept || item.name,
      statement: previous?.statement || item.statement,
      aliases: [...new Set([...(previous?.aliases || []), item.statement, ...item.aliases])].filter(alias => alias !== (previous?.statement || item.statement)).slice(0, 16),
      sources,
    })
    aliases.set(id, id)
  }

  const chains = new Map((graph.chains || []).map(item => [item.id, item]))
  for (const item of update.chains) {
    const conclusion = aliases.get(item.conclusion) || (propositions.has(item.conclusion) ? item.conclusion : '')
    const premises = item.premises.map(id => aliases.get(id) || (propositions.has(id) ? id : '')).filter(Boolean)
    if (!conclusion || premises.length !== item.premises.length || premises.includes(conclusion)) continue
    const key = `${[...new Set(premises)].sort().join('+')}->${conclusion}`
    const previous = chains.get(key)
    const sourceRecord = { sourceId: source.paperId, sourceTitle: source.paperTitle, refs: refsForPages(item.sourcePages, segments), sourceRefs: sourceRefsForPages(item.sourcePages, source.paperId, source.paperTitle, segments), ...sourceRef, pages: item.sourcePages }
    chains.set(key, {
      id: key, premises: [...new Set(premises)].sort(), conclusion, reason: previous?.reason || item.reason,
      sources: [...(previous?.sources || []).filter(entry => (entry.sourceId || entry.paperId) !== source.paperId || entry.checkpoint !== source.checkpoint), sourceRecord],
    })
  }
  return { ...graph, propositions: [...propositions.values()], chains: [...chains.values()] }
}

export async function listPapers(): Promise<ImportedPaper[]> {
  const stored = await loadStoredPapers()
  await Promise.all(stored.map(loadBinary))
  return stored.map(withBinary).map(paper => {
    if (paper.sourceKind && paper.sourceSegments) return paper
    const source = toLearningSource(paper)
    return { ...paper, sourceKind: source.kind, sourceSegments: source.segments }
  }).sort((a, b) => b.importedAt.localeCompare(a.importedAt))
}

export async function savePaper(paper: ImportedPaper): Promise<void> {
  const source = paper.sourceKind && paper.sourceSegments ? paper : { ...paper, ...(() => {
    const normalized = toLearningSource(paper)
    return { sourceKind: normalized.kind, sourceSegments: normalized.segments }
  })() }
  const { stored, files, parts } = splitBinary(source)
  // Files go first: if an upload fails there is no record pointing at a missing file, only an orphan the server sweeps later.
  for (const [name, blob] of files) {
    if (uploaded.has(blob)) continue
    await api(`${LIBRARY}/papers/${paper.id}/blobs/${name}`, { method: 'PUT', body: blob, headers: { 'content-type': 'application/octet-stream' } })
    uploaded.add(blob)
  }
  await api(`${LIBRARY}/papers/${paper.id}`, { method: 'PUT', json: { paper: stored } })
  binaries.set(paper.id, parts)
}

export async function deletePaper(paperId: string): Promise<void> {
  await api(`${LIBRARY}/papers/${paperId}`, { method: 'DELETE' })
  binaries.delete(paperId)
}

function openLegacyLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(KNOWLEDGE_STORE)) request.result.createObjectStore(KNOWLEDGE_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open the old browser library.'))
  })
}

function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

/**
 * Moves sources saved in this browser before accounts existed into a new, empty account.
 * The browser copy is left untouched, so nothing is lost if the upload fails partway.
 */
export async function importBrowserLibrary(): Promise<number> {
  if ((await loadStoredPapers()).length) return 0
  const db = await openLegacyLibrary()
  const [papers, knowledge] = await Promise.all([readAll<ImportedPaper>(db, STORE_NAME), readAll<{ id: string; graph?: KnowledgeGraph; evidence?: LearningEvidence[] }>(db, KNOWLEDGE_STORE)])
  db.close()
  if (!papers.length) return 0
  for (const paper of papers) await savePaper(paper)
  const doc = await loadKnowledge()
  const graph = knowledge.find(item => item.id === 'profile')?.graph
  const learner = knowledge.find(item => item.id === 'learner')
  if (doc.rev === 0 && (graph || learner)) await api(`${LIBRARY}/knowledge`, { method: 'PUT', json: { rev: 0, graph: graph || EMPTY_GRAPH, learner: { evidence: learner?.evidence || [] } } })
  return papers.length
}
