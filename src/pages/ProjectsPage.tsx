import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { Project } from '@/projects'

export function ProjectsPage({ projects, onOpen, onCreate, onDelete }: {
  projects: Project[]
  onOpen: (id: string) => void
  onCreate: (name: string, description: string) => void
  onDelete: (project: Project) => void
}) {
  const [creating, setCreating] = useState(!projects.length)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const submit = () => {
    if (!name.trim()) return
    onCreate(name, description)
    setName(''); setDescription(''); setCreating(false)
  }
  return (
    <div className="page projects-page">
      <header className="page-head">
        <h1>Your projects</h1>
        <p>Each project gathers the sources you want to understand together.</p>
        {!creating && <Button onClick={() => setCreating(true)}>New project</Button>}
      </header>

      {creating && (
        <form className="desk-card new-project" onSubmit={e => { e.preventDefault(); submit() }}>
          <h2>New project</h2>
          <label>Name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Climate economics" maxLength={120} /></label>
          <label>What is it about? <span>(optional)</span><textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={400} /></label>
          <div className="row">
            <Button type="submit" disabled={!name.trim()}>Create project</Button>
            {projects.length > 0 && <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>}
          </div>
        </form>
      )}

      <ul className="card-grid">
        {projects.map((p, i) => (
          <li key={p.id} className="desk-card project-card" style={{ rotate: `${((i * 37) % 5) - 2}deg` }}>
            <button className="card-hit" onClick={() => onOpen(p.id)} aria-label={`Open ${p.name}`} />
            <h2>{p.name}</h2>
            {p.description && <p className="muted">{p.description}</p>}
            <p className="meta">{p.sourceIds.length} {p.sourceIds.length === 1 ? 'source' : 'sources'} · {new Date(p.createdAt).toLocaleDateString()}</p>
            <button className="card-delete" aria-label={`Delete ${p.name}`} title="Delete project (sources stay in your library)" onClick={() => onDelete(p)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
