import { useEffect, useState } from 'react'
import './board.css'
import { createShapeId, useEditor, useValue, type Editor, type TLShape } from 'tldraw'
import type { ImportedPaper } from '@/storage'
import { PersistentTldraw } from '@/persistentCanvas'
import { loadProjects, PROJECTS_UPDATED_EVENT, type Project, type ProjectSynthesis } from '@/projects'
import { CARD_H, CARD_W, RELATIONS, boardShapeUtils, type Relation } from './shapes'
import { CUT_TOTAL_MS } from './cutRope'

const GRID = { cols: 4, dx: CARD_W + 90, dy: CARD_H + 120 }

/** First grid cell whose card slot is empty, so new sources never land on top of moved ones. */
function freeSpot(editor: Editor) {
  const taken = editor.getCurrentPageShapes().filter(s => s.type === 'source-card').map(s => editor.getShapePageBounds(s)!)
  for (let i = 0; ; i++) {
    const x = (i % GRID.cols) * GRID.dx, y = Math.floor(i / GRID.cols) * GRID.dy
    if (!taken.some(b => b.x < x + CARD_W && x < b.x + b.w && b.y < y + CARD_H && y < b.y + b.h)) return { x, y }
  }
}

/** Adds missing cards (under any string, so pins stay on top) and drops cards for deleted sources. Returns how many were added. */
function syncCards(editor: Editor, papers: ImportedPaper[], summaries: Record<string, string>) {
  const cards = editor.getCurrentPageShapes().filter(s => s.type === 'source-card')
  const onBoard = new Set(cards.map(c => c.props.sourceId))
  const live = new Set(papers.map(p => p.id))
  const added = papers.filter(p => !onBoard.has(p.id)).map(p => ({ paper: p, id: createShapeId() }))
  editor.run(() => {
    editor.deleteShapes(cards.filter(c => !live.has(c.props.sourceId)).map(c => c.id))
    for (const { paper, id } of added) {
      editor.createShape({
        id, type: 'source-card', ...freeSpot(editor),
        props: { sourceId: paper.id, title: paper.title, kind: paper.sourceKind || 'pdf', segments: paper.pageCount, imported: new Date(paper.importedAt).toLocaleDateString(), summary: summaries[paper.id] || '' },
      })
    }
    for (const card of cards.filter(card => live.has(card.props.sourceId))) {
      const summary = summaries[card.props.sourceId] || ''
      if (card.props.summary !== summary) editor.updateShape({ id: card.id, type: 'source-card', props: { summary } })
    }
    if (added.length) editor.sendToBack(added.map(a => a.id))
  }, { history: 'ignore' })
  return added.length
}

function tie(editor: Editor, [a, b]: TLShape[]) {
  const id = createShapeId()
  editor.createShape({ id, type: 'red-string', x: 0, y: 0, props: { fromId: a.id, toId: b.id, relation: '' }, meta: { tiedAt: Date.now() } })
  editor.select(id)
}

/** Cutting plays the snap, drop and dissolve first, then deletes. The cut mark skips undo history, so undo restores a whole string. */
function cutString(editor: Editor, string: TLShape) {
  editor.selectNone()
  editor.run(() => editor.updateShape({ id: string.id, type: 'red-string', meta: { ...string.meta, cutAt: Date.now() } }), { history: 'ignore' })
  window.setTimeout(() => {
    if (!editor.getShape(string.id)) return
    editor.markHistoryStoppingPoint('cut string')
    editor.deleteShapes([string.id])
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 320 : CUT_TOTAL_MS)
}

/** Floating actions for the current selection: tie two cards, or name a string's relation. */
function SelectionActions() {
  const editor = useEditor()
  const selected = useValue('selection', () => editor.getSelectedShapes(), [editor])
  const cards = selected.filter(s => s.type === 'source-card')
  const string = selected.length === 1 && selected[0].type === 'red-string' ? selected[0] : null
  if (cards.length === 2 && selected.length === 2) {
    return <div className="board-actions" role="toolbar" aria-label="Selection actions"><button onClick={() => tie(editor, cards)}>Tie with string</button></div>
  }
  if (!string) return null
  const set = (relation: Relation) => editor.updateShape({ id: string.id, type: 'red-string', props: { relation } })
  return (
    <div className="board-actions" role="toolbar" aria-label="String relation">
      {RELATIONS.map(r => <button key={r} aria-pressed={string.props.relation === r} onClick={() => set(string.props.relation === r ? '' : r)}>{r}</button>)}
      <button onClick={() => cutString(editor, string)}>Cut string</button>
    </div>
  )
}

export function Board({ canvasKey, papers, summaries, onOpen, onCompare, onAdd }: { canvasKey: string; papers: ImportedPaper[]; summaries: Record<string, string>; onOpen: (sourceId: string) => void; onCompare: (leftId: string, rightId: string) => void; onAdd: () => void }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [synthesis, setSynthesis] = useState<ProjectSynthesis | null>(null)

  useEffect(() => {
    if (editor && syncCards(editor, papers, summaries)) editor.zoomToFit({ animation: { duration: 320 } })
  }, [editor, papers, summaries])

  useEffect(() => {
    let live = true
    const select = (projects: Project[]) => projects.find(project => canvasKey === `board-${project.id}`)?.synthesis || null
    const onProjectsUpdated = (event: Event) => setSynthesis(select((event as CustomEvent<Project[]>).detail))
    window.addEventListener(PROJECTS_UPDATED_EVENT, onProjectsUpdated)
    loadProjects().then(projects => { if (live) setSynthesis(select(projects)) }).catch(() => { if (live) setSynthesis(null) })
    return () => { live = false; window.removeEventListener(PROJECTS_UPDATED_EVENT, onProjectsUpdated) }
  }, [canvasKey])

  useEffect(() => {
    if (!editor) return
    const offDelete = editor.sideEffects.registerAfterDeleteHandler('shape', shape => {
      if (shape.type !== 'source-card') return
      const loose = editor.getCurrentPageShapes().filter(s => s.type === 'red-string' && (s.props.fromId === shape.id || s.props.toId === shape.id))
      if (loose.length) editor.deleteShapes(loose.map(s => s.id))
    })
    // HTML shapes report double-clicks as hitting the canvas, so find the card under the pointer.
    const onEvent = (info: { name: string; phase?: string }) => {
      if (info.name !== 'double_click' || info.phase !== 'up') return
      const card = editor.getShapesAtPoint(editor.inputs.getCurrentPagePoint(), { hitInside: true }).find(s => s.type === 'source-card')
      if (card) onOpen(card.props.sourceId)
    }
    editor.on('event', onEvent as never)
    return () => { offDelete(); editor.off('event', onEvent as never) }
  }, [editor, onOpen])

  return (
    <div className="board">
      <PersistentTldraw
        canvasKey={canvasKey}
        shapeUtils={boardShapeUtils}
        components={{ PageMenu: null, DebugMenu: null, DebugPanel: null, StylePanel: null, InFrontOfTheCanvas: SelectionActions }}
        onMount={ed => {
          setEditor(ed)
          if (import.meta.env.DEV) Object.assign(window, { boardEditor: ed }) // for local UI checks
        }}
      />
      {synthesis && <aside className="board-connections" aria-label="How project sources connect">
        <h2>How these sources connect</h2>
        <p>{synthesis.synthesis}</p>
        {synthesis.connections.length > 0 && <ul>{synthesis.connections.map((connection, index) => {
          const left = papers.find(paper => paper.id === connection.leftId)
          const right = papers.find(paper => paper.id === connection.rightId)
          if (!left || !right) return null
          return <li key={`${connection.leftId}:${connection.rightId}:${index}`}>
            <button onClick={() => onCompare(left.id, right.id)} aria-label={`Compare ${left.title} and ${right.title}: ${connection.relation}`}>
              <span><b>{left.title}</b> <i>{connection.relation}</i> <b>{right.title}</b></span>
              <small>{connection.reason}</small>
            </button>
          </li>
        })}</ul>}
      </aside>}
      {!papers.length && (
        <div className="board-empty">
          <p>Your board is empty.</p>
          <p className="board-empty-hint">Add papers, notes, slides or recordings. Each one lands here as a card you can tie to others.</p>
          <button onClick={onAdd}>Add material</button>
        </div>
      )}
    </div>
  )
}
