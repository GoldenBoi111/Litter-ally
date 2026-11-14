import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { FilesystemBackend } from 'deepagents'

/**
 * Shared memory for the course agents: one folder per user and project on disk.
 * Agents see it through deepagents' FilesystemBackend in virtual mode ("/notes/x.md"); server code writes the same
 * files directly. Paths are split so parallel writers never share a file:
 *
 *   /sources/source_{sid}_meta.json          source identity (content hash), so a known source is never re-read
 *   /sources/slices/source_{sid}_chunk_{n}.txt  immutable input slices
 *   /notes/source_{sid}_chunk_{n}_notes.md   written only by the reader for that slice
 *   /notes/source_{sid}_synthesis.md         written only by the synthesis subagent
 *   /external_refs/exa_{slug}.md             cached background searches, shared by all readers
 *   /learner/learner_record.json             the learner's mastery record when the job started
 *   /plan/source_{sid}_checkpoint_1.json     written by the fast path
 *   /plan/source_{sid}_teaching_plan.json    checkpoints 2..N, written only by the planner subagent
 */

const SAFE = /^[A-Za-z0-9_-]{1,100}$/

export function sourceId(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** A stable project id for a single source when the client did not name a project. */
export function defaultProjectId(text) {
  return `src-${sourceId(text)}`
}

export function slug(value) {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'concept'
}

export const paths = {
  meta: sid => `/sources/source_${sid}_meta.json`,
  slice: (sid, n) => `/sources/slices/source_${sid}_chunk_${n}.txt`,
  notes: (sid, n) => `/notes/source_${sid}_chunk_${n}_notes.md`,
  synthesis: sid => `/notes/source_${sid}_synthesis.md`,
  ref: concept => `/external_refs/exa_${slug(concept)}.md`,
  learner: () => '/learner/learner_record.json',
  checkpoint1: sid => `/plan/source_${sid}_checkpoint_1.json`,
  plan: sid => `/plan/source_${sid}_teaching_plan.json`,
}

export class Workspace {
  constructor({ dataDir, userId, projectId }) {
    if (!SAFE.test(String(userId)) || !SAFE.test(String(projectId))) throw new Error('Invalid workspace owner or project id.')
    this.root = resolve(dataDir, 'agent-workspaces', String(userId), String(projectId))
    this.userId = String(userId)
    this.projectId = String(projectId)
  }

  /** Maps a virtual path like "/notes/a.md" onto disk, refusing anything that escapes the project folder. */
  file(virtualPath) {
    const target = resolve(this.root, `.${virtualPath.startsWith('/') ? virtualPath : `/${virtualPath}`}`)
    if (target !== this.root && !target.startsWith(this.root + sep)) throw new Error(`Path escapes the workspace: ${virtualPath}`)
    return target
  }

  async write(virtualPath, content) {
    const target = this.file(virtualPath)
    await mkdir(dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temp, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
    await rename(temp, target)
  }

  async read(virtualPath) {
    try { return await readFile(this.file(virtualPath), 'utf8') } catch (error) {
      if (error?.code === 'ENOENT') return null
      throw error
    }
  }

  async readJson(virtualPath) {
    const text = await this.read(virtualPath)
    if (text === null) return null
    try { return JSON.parse(text) } catch { return null }
  }

  /** Virtual paths of files directly inside a virtual folder whose names match the pattern. */
  async list(virtualDir, pattern = /./) {
    try {
      const names = await readdir(this.file(virtualDir))
      return names.filter(name => pattern.test(name)).sort().map(name => join(virtualDir, name))
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
  }

  /** The same folder as a deepagents backend, so agent file tools and server code share one store. */
  backend() {
    return new FilesystemBackend({ rootDir: this.root, virtualMode: true })
  }
}
