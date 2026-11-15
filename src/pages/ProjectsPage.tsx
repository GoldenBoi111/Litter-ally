import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { projectSynthesisKey, type Project } from '@/projects'
import type { ImportedPaper } from '@/storage'

const PREVIEW_POINTS = [{ x: 24, y: 28 }, { x: 73, y: 23 }, { x: 33, y: 72 }, { x: 77, y: 73 }]

function ProjectPreview({ project, papers }: { project: Project; papers: ImportedPaper[] }) {
  const links = project.synthesisFor === projectSynthesisKey(project) ? project.synthesis?.connections || [] : []
  const ids = [...new Set([...links.flatMap(link => [link.leftId, link.rightId]), ...project.sourceIds])]
    .filter(id => project.sourceIds.includes(id)).slice(0, PREVIEW_POINTS.length)
  const visibleLinks = links.filter(link => ids.includes(link.leftId) && ids.includes(link.rightId)).slice(0, 6)
  return <div className="project-preview" aria-hidden="true">
    <span className="project-preview-label">Board preview</span>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {visibleLinks.map(link => {
        const a = PREVIEW_POINTS[ids.indexOf(link.leftId)], b = PREVIEW_POINTS[ids.indexOf(link.rightId)]
        return <path key={`${link.leftId}:${link.rightId}`} d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + 9} ${b.x} ${b.y}`} />
      })}
    </svg>
    {ids.map((id, index) => <span key={id} className="project-preview-note" style={{ left: `${PREVIEW_POINTS[index].x}%`, top: `${PREVIEW_POINTS[index].y}%` }}>
      <i />{papers.find(paper => paper.id === id)?.title || `Source ${index + 1}`}
    </span>)}
    {!ids.length && <p className="project-preview-empty">Add a source to start mapping ideas.</p>}
    {project.sourceIds.length > ids.length && <span className="project-preview-more">+{project.sourceIds.length - ids.length} more</span>}
  </div>
}

function ProjectFacts({ project }: { project: Project }) {
  const sources = project.sourceIds.length
  const links = project.synthesisFor === projectSynthesisKey(project) ? project.synthesis?.connections.length : null
  const reviewed = (project.reviewedSourceIds || []).filter(id => project.sourceIds.includes(id)).length
  return <span className="project-facts">
    <span>{sources} {sources === 1 ? 'source' : 'sources'}</span>
    {sources > 1 && <span>{links === null ? 'Finding connections' : `${links} ${links === 1 ? 'connection' : 'connections'}`}</span>}
    {sources > 0 && <span>{reviewed} reviewed</span>}
  </span>
}

export function ProjectsPage({ projects, papers, loading = false, onOpen, onCreate, onDelete }: {
  projects: Project[]
  papers: ImportedPaper[]
  loading?: boolean
  onOpen: (id: string) => void
  onCreate: (name: string, description: string) => void
  onDelete: (project: Project) => void
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const submit = () => {
    if (!name.trim()) return
    onCreate(name, description)
    setName(''); setDescription(''); setCreating(false)
  }
  const [featured, ...others] = [...projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return <div className="page projects-page">
    <div className="projects-inner">
      <header className="projects-header">
        <div>
          <p className="projects-eyebrow">Your workspace / {projects.length} {projects.length === 1 ? 'board' : 'boards'}</p>
          <h1>Projects</h1>
        </div>
        {!creating && !loading && projects.length > 0 && <Button onClick={() => setCreating(true)}>+ New project</Button>}
      </header>

      {creating && <form className="projects-create" onSubmit={event => { event.preventDefault(); submit() }}>
        <div className="projects-create-head"><span className="projects-eyebrow">New board</span><h2>What are you learning?</h2></div>
        <label>Project name<input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Climate economics" maxLength={120} /></label>
        <label>What is it about? <span>(optional)</span><textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} maxLength={400} placeholder="A question or goal you want this board to hold" /></label>
        <div className="projects-create-actions"><Button type="submit" disabled={!name.trim()}>Create board</Button><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button></div>
      </form>}

      {loading ? <p className="projects-loading" role="status">Opening your projects…</p> : featured ? <>
        <section className="projects-section" aria-labelledby="projects-continue-heading">
          <div className="projects-section-heading"><h2 id="projects-continue-heading">Newest board</h2><span>Recently created</span></div>
          <article className="project-feature">
            <div className="project-feature-copy">
              <p className="projects-eyebrow">Project board</p>
              <h3>{featured.name}</h3>
              <p className="project-description">{featured.description || 'Your sources and their connections live together here.'}</p>
              <ProjectFacts project={featured} />
              <div className="project-actions"><Button onClick={() => onOpen(featured.id)}>Open board <span aria-hidden="true">↗</span></Button><button className="project-remove" onClick={() => onDelete(featured)} aria-label={`Delete ${featured.name}`}>Delete project</button></div>
            </div>
            <ProjectPreview project={featured} papers={papers} />
          </article>
        </section>
        {others.length > 0 && <section className="projects-section" aria-labelledby="projects-all-heading">
          <div className="projects-section-heading"><h2 id="projects-all-heading">Other boards</h2><span>{others.length} {others.length === 1 ? 'project' : 'projects'}</span></div>
          <ul className="projects-list">{others.map(project => <li key={project.id} className="project-list-item">
            <button className="project-list-open" onClick={() => onOpen(project.id)} aria-label={`Open board ${project.name}`}>
              <span className="project-list-mark" aria-hidden="true">{project.name.charAt(0).toUpperCase()}</span>
              <span className="project-list-copy"><strong>{project.name}</strong><small>{project.description || 'Open this board to explore its sources.'}</small></span>
              <ProjectFacts project={project} />
              <span className="project-list-arrow" aria-hidden="true">↗</span>
            </button>
            <button className="project-list-delete" onClick={() => onDelete(project)} aria-label={`Delete ${project.name}`} title="Delete project; sources remain in your library">×</button>
          </li>)}</ul>
        </section>}
      </> : !creating && <section className="projects-first">
        <div className="projects-first-art" aria-hidden="true"><span /><span /><span /><i /><i /></div>
        <div><p className="projects-eyebrow">A place to begin</p><h2>Start with a question.</h2><p>Create a board, add material, and see how its ideas connect.</p><Button onClick={() => setCreating(true)}>Create your first board</Button></div>
      </section>}
    </div>
  </div>
}
