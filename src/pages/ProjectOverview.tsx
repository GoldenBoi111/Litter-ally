import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ImportedPaper } from '@/storage'
import type { Project } from '@/projects'

export function ProjectOverview({ project, sources, library, pendingSummaries, onLearn, onBoard, onDeep, onAdd, onAttach, onDetach }: {
  project: Project
  sources: ImportedPaper[]
  library: ImportedPaper[]
  pendingSummaries: Set<string>
  onLearn: (sourceId: string) => void
  onBoard: () => void
  onDeep: () => void
  onAdd: () => void
  onAttach: (sourceId: string) => void
  onDetach: (sourceId: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const others = library.filter(p => !project.sourceIds.includes(p.id))
  return (
    <div className="page overview-page">
      <header className="page-head">
        <h1>{project.name}</h1>
        {project.description && <p>{project.description}</p>}
        <div className="row">
          <Button onClick={onBoard} disabled={!sources.length}>Open project board</Button>
          <Button onClick={onDeep} disabled={!sources.length} variant="outline">Deep dive: learn it end to end</Button>
          <Button onClick={onAdd} variant="ghost">Add new material</Button>
          {others.length > 0 && <Button onClick={() => setPicking(v => !v)} variant="ghost">{picking ? 'Done' : 'Add from library'}</Button>}
        </div>
      </header>

      {picking && (
        <section className="desk-card picker">
          <h2>Add sources you already have</h2>
          <ul>{others.map(p => <li key={p.id}><span className="kind">{(p.sourceKind || 'pdf').toUpperCase()}</span>{p.title}<Button size="sm" variant="outline" onClick={() => onAttach(p.id)}>Add</Button></li>)}</ul>
        </section>
      )}

      {!sources.length && <p className="empty">No sources yet. Add material to start this project.</p>}

      <ul className="card-grid">
        {sources.map((p, i) => {
          const s = project.summaries[p.id]
          return (
            <li key={p.id} className="desk-card source-card" style={{ rotate: `${((i * 53) % 5) - 2}deg` }}>
              <button className="card-hit" onClick={() => onLearn(p.id)} aria-label={`Learn ${p.title}`} />
              <span className="kind">{(p.sourceKind || 'pdf').toUpperCase()}</span>
              <h2>{p.title}</h2>
              <p className={s ? 'tidbit' : 'tidbit muted'}>{s ? s.tidbit : pendingSummaries.has(p.id) ? 'Reading this source…' : 'No summary yet.'}</p>
              <p className="meta">{p.pageCount} sections · click to learn</p>
              <button className="card-delete" aria-label={`Remove ${p.title} from project`} title="Remove from project (stays in your library)" onClick={() => onDetach(p.id)}>×</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
