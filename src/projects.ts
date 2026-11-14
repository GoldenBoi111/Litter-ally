import { api, loadCanvas, saveCanvas, type ImportedPaper } from './storage'

export type SourceSummary = { tidbit: string; summary: string; keyIdeas: string[]; documentRole?: 'content' | 'process'; v?: number }
/** Bump when the summary prompt changes so cached summaries regenerate (v2: state the content, not what the source is about). */
export const SUMMARY_VERSION = 2
export const isCurrentSummary = (s?: SourceSummary) => !!s && s.v === SUMMARY_VERSION
export type ProjectConnection = { leftId: string; rightId: string; relation: 'supports' | 'contradicts' | 'extends'; reason: string }
export type ProjectSynthesis = { synthesis: string; connections: ProjectConnection[] }
export type Project = {
  id: string
  name: string
  description: string
  sourceIds: string[]
  createdAt: string
  /** Cached AI summaries per source id. */
  summaries: Record<string, SourceSummary>
  /** Cross-source links, built only from the cached source summaries. */
  synthesis?: ProjectSynthesis
  synthesisFor?: string
  /** Generated source links the learner chose to hide from the board. */
  hiddenConnectionPairs?: string[]
  /** Sources whose full lesson finished with a clear final review. */
  reviewedSourceIds?: string[]
}

// Projects ride on the per-user canvas store, so they are saved to the account with no new server storage.
const KEY = 'projects-v1'
export const PROJECTS_UPDATED_EVENT = 'litter-ally:projects-updated'
let saveQueue = Promise.resolve()

export async function loadProjects(): Promise<Project[]> {
  const doc = await loadCanvas<{ projects: Project[] }>(KEY)
  return (doc?.projects || []).map(p => ({ ...p, summaries: p.summaries || {}, sourceIds: p.sourceIds || [], reviewedSourceIds: p.reviewedSourceIds || [], hiddenConnectionPairs: p.hiddenConnectionPairs || [] }))
}

export function saveProjects(projects: Project[]): Promise<void> {
  // Summaries may finish together; keep older snapshots from arriving after newer ones.
  const save = saveQueue.then(() => saveCanvas(KEY, { projects }))
  saveQueue = save.catch(() => {})
  return save.then(() => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROJECTS_UPDATED_EVENT, { detail: projects }))
  })
}

export function newProject(name: string, description = '', sourceIds: string[] = []): Project {
  return { id: crypto.randomUUID(), name: name.trim() || 'Untitled project', description: description.trim(), sourceIds, createdAt: new Date().toISOString(), summaries: {}, reviewedSourceIds: [], hiddenConnectionPairs: [] }
}

export function markSourcesReviewed(project: Project, sourceIds: string[]): Project {
  return { ...project, reviewedSourceIds: [...new Set([...(project.reviewedSourceIds || []), ...sourceIds.filter(id => project.sourceIds.includes(id))])] }
}

export function projectBoardKey(projectId: string) {
  return `board-${projectId.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 100)
}

export async function summarizeSource(paper: ImportedPaper): Promise<SourceSummary> {
  const summary = await api<SourceSummary>('/api/source/summary', { method: 'POST', json: { title: paper.title, text: paper.text.slice(0, 24_000) } })
  return { ...summary, documentRole: summary.documentRole === 'process' ? 'process' : 'content', v: SUMMARY_VERSION }
}

export async function synthesizeProject(project: Project, sources: ImportedPaper[]): Promise<ProjectSynthesis> {
  return api<ProjectSynthesis>('/api/project/synthesis', { method: 'POST', json: {
    name: project.name,
    sources: project.sourceIds.flatMap(id => {
      const summary = project.summaries[id]
      const source = sources.find(item => item.id === id)
      return summary && source ? [{ id, title: source.title, summary: summary.summary, keyIdeas: summary.keyIdeas }] : []
    }),
  } })
}

export function projectSynthesisKey(project: Project) {
  const sourceIds = JSON.stringify(project.sourceIds)
  if (project.synthesis && project.synthesisFor && project.synthesisFor !== sourceIds) {
    try {
      const cached = JSON.parse(project.synthesisFor)
      const cachedIds = cached[0] === 'v2' ? cached[2].map(([id]: [string]) => id) : cached.map(([id]: [string]) => id)
      if (JSON.stringify(cachedIds) === sourceIds) return project.synthesisFor
    } catch {}
  }
  return sourceIds
}

export const COMPARE_GOAL = (a: string, b: string) =>
  `Explain how "${a}" and "${b}" connect: where they agree, where they differ or conflict, and how ideas in one build on or challenge the other. Compare and contrast them using evidence from both sources.`

export const DEEP_GOAL = (project: string) =>
  `Teach the project "${project}" end to end. Put the sources in the most logical learning order, explain each in turn, and show explicitly how each source builds on, supports, or contrasts with the ones before it, finishing with a synthesis of the whole.`
