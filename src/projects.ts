import { api, loadCanvas, saveCanvas, type ImportedPaper } from './storage'

export type SourceSummary = { tidbit: string; summary: string; keyIdeas: string[] }
export type Project = {
  id: string
  name: string
  description: string
  sourceIds: string[]
  createdAt: string
  /** Cached AI summaries per source id. */
  summaries: Record<string, SourceSummary>
}

// Projects ride on the per-user canvas store, so they are saved to the account with no new server storage.
const KEY = 'projects-v1'

export async function loadProjects(): Promise<Project[]> {
  const doc = await loadCanvas<{ projects: Project[] }>(KEY)
  return (doc?.projects || []).map(p => ({ ...p, summaries: p.summaries || {}, sourceIds: p.sourceIds || [] }))
}

export async function saveProjects(projects: Project[]): Promise<void> {
  await saveCanvas(KEY, { projects })
}

export function newProject(name: string, description = '', sourceIds: string[] = []): Project {
  return { id: crypto.randomUUID(), name: name.trim() || 'Untitled project', description: description.trim(), sourceIds, createdAt: new Date().toISOString(), summaries: {} }
}

export function projectBoardKey(projectId: string) {
  return `board-${projectId.replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 100)
}

export async function summarizeSource(paper: ImportedPaper): Promise<SourceSummary> {
  return api<SourceSummary>('/api/source/summary', { method: 'POST', json: { title: paper.title, text: paper.text.slice(0, 24_000) } })
}

export const COMPARE_GOAL = (a: string, b: string) =>
  `Explain how "${a}" and "${b}" connect: where they agree, where they differ or conflict, and how ideas in one build on or challenge the other. Compare and contrast them using evidence from both sources.`

export const DEEP_GOAL = (project: string) =>
  `Teach the project "${project}" end to end. Put the sources in the most logical learning order, explain each in turn, and show explicitly how each source builds on, supports, or contrasts with the ones before it, finishing with a synthesis of the whole.`
