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

const DB_NAME = 'margin-library'
const STORE_NAME = 'papers'
const KNOWLEDGE_STORE = 'knowledge'
const TLDRAW_DB_PREFIX = 'TLDRAW_DOCUMENT_v2' // tldraw 5.6.0's per-persistenceKey IndexedDB name.

export function paperCanvasPersistenceKey(paperId: string) {
  return `margin-paper-v2-${paperId}`
}

export function deletePaperCanvas(paperId: string, onBlocked?: () => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(`${TLDRAW_DB_PREFIX}${paperCanvasPersistenceKey(paperId)}`)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('Could not remove this paper’s saved canvas.'))
    request.onblocked = () => onBlocked?.()
  })
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(KNOWLEDGE_STORE)) request.result.createObjectStore(KNOWLEDGE_STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open the local paper library.'))
  })
}

export async function loadKnowledgeGraph(): Promise<KnowledgeGraph> {
  const db = await openLibrary()
  return new Promise((resolve, reject) => {
    const request = db.transaction(KNOWLEDGE_STORE, 'readonly').objectStore(KNOWLEDGE_STORE).get('profile')
    request.onsuccess = () => resolve(request.result?.graph || { nodes: [], edges: [] })
    request.onerror = () => reject(request.error || new Error('Could not read your learning map.'))
  })
}

export async function loadLearningProfile(): Promise<LearningProfile> {
  const db = await openLibrary()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, KNOWLEDGE_STORE], 'readonly')
    const papersRequest = transaction.objectStore(STORE_NAME).getAll()
    const profileRequest = transaction.objectStore(KNOWLEDGE_STORE).get('learner')
    let evidence: LearningEvidence[] = []
    let profile: LearningEvidence[] = []
    let loaded = 0
    const finish = () => {
      if (++loaded !== 2) return
      const byReview = new Map<string, LearningEvidence>()
      for (const item of [...evidence, ...profile]) {
        const key = `${item.sourceId || item.sourceTitle || item.source}:${item.reviewedAt}:${item.question}:${item.answer}`
        byReview.set(key, item)
      }
      resolve({ evidence: [...byReview.values()].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt)).slice(-200) })
    }
    papersRequest.onsuccess = () => {
      evidence = (papersRequest.result as ImportedPaper[]).flatMap(paper => (paper.learningState?.evidence || []).map(item => ({
        ...item, sourceId: item.sourceId || paper.id, sourceTitle: item.sourceTitle || paper.title,
      })))
      finish()
    }
    profileRequest.onsuccess = () => { profile = profileRequest.result?.evidence || []; finish() }
    papersRequest.onerror = () => reject(papersRequest.error || new Error('Could not read learner evidence.'))
    profileRequest.onerror = () => reject(profileRequest.error || new Error('Could not read learner evidence.'))
  })
}

type LearningWrite = { paper: ImportedPaper; graph: KnowledgeGraph; profile?: LearningProfile }
type GraphUpdate = (graph: KnowledgeGraph) => KnowledgeGraph

async function updatePaperAndKnowledge(paperId: string, updateGraph: GraphUpdate, updatePaper: (paper: ImportedPaper) => ImportedPaper, updateProfile?: (profile: LearningProfile) => LearningProfile): Promise<LearningWrite> {
  const db = await openLibrary()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME, KNOWLEDGE_STORE], 'readwrite')
    let updatedPaper: ImportedPaper | undefined
    let updatedGraph: KnowledgeGraph | undefined
    let updatedProfile: LearningProfile | undefined
    let failure: Error | undefined
    const papers = transaction.objectStore(STORE_NAME)
    const paperRequest = papers.get(paperId)
    paperRequest.onsuccess = () => {
      if (!paperRequest.result) {
        failure = new Error('This paper is no longer in your library.')
        transaction.abort()
        return
      }
      try {
        updatedPaper = updatePaper(paperRequest.result as ImportedPaper)
      } catch (error) {
        failure = error instanceof Error ? error : new Error('Could not update this paper.')
        transaction.abort()
        return
      }
      papers.put(updatedPaper)
    }
    paperRequest.onerror = () => transaction.abort()
    const knowledge = transaction.objectStore(KNOWLEDGE_STORE)
    const graphRequest = knowledge.get('profile')
    graphRequest.onsuccess = () => {
      try {
        updatedGraph = updateGraph(graphRequest.result?.graph || { nodes: [], edges: [] })
        knowledge.put({ id: 'profile', graph: updatedGraph })
      } catch (error) {
        failure = error instanceof Error ? error : new Error('Could not update the learning map.')
        transaction.abort()
      }
    }
    graphRequest.onerror = () => transaction.abort()
    if (updateProfile) {
      const profileRequest = knowledge.get('learner')
      profileRequest.onsuccess = () => {
        try {
          updatedProfile = updateProfile(profileRequest.result || { evidence: [] })
          knowledge.put({ id: 'learner', ...updatedProfile })
        } catch (error) {
          failure = error instanceof Error ? error : new Error('Could not update learner evidence.')
          transaction.abort()
        }
      }
      profileRequest.onerror = () => transaction.abort()
    }
    transaction.oncomplete = () => updatedPaper && updatedGraph ? resolve({ paper: updatedPaper, graph: updatedGraph, ...(updatedProfile ? { profile: updatedProfile } : {}) }) : reject(new Error('Could not save your learning progress.'))
    transaction.onerror = () => reject(transaction.error || new Error('Could not save your learning map.'))
    transaction.onabort = () => reject(failure || transaction.error || new Error('Saving your learning progress was interrupted.'))
  })
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
  const db = await openLibrary()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve((request.result as ImportedPaper[]).map(paper => {
      if (paper.sourceKind && paper.sourceSegments) return paper
      const source = toLearningSource(paper)
      return { ...paper, sourceKind: source.kind, sourceSegments: source.segments }
    }).sort((a, b) => b.importedAt.localeCompare(a.importedAt)))
    request.onerror = () => reject(request.error || new Error('Could not read the local paper library.'))
  })
}

export async function savePaper(paper: ImportedPaper): Promise<void> {
  const db = await openLibrary()
  const source = paper.sourceKind && paper.sourceSegments ? paper : { ...paper, ...(() => {
    const normalized = toLearningSource(paper)
    return { sourceKind: normalized.kind, sourceSegments: normalized.segments }
  })() }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(source)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('Could not save this paper on the device.'))
    transaction.onabort = () => reject(transaction.error || new Error('Saving this paper was interrupted.'))
  })
}

export async function deletePaper(paperId: string): Promise<void> {
  const db = await openLibrary()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(paperId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('Could not remove this paper from the library.'))
    transaction.onabort = () => reject(transaction.error || new Error('Removing this paper was interrupted.'))
  })
}
