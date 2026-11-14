import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import './board.css'
import { createShapeId, useEditor, useValue, type Editor, type TLShape } from 'tldraw'
import type { ImportedPaper } from '@/storage'
import { PersistentTldraw } from '@/persistentCanvas'
import { loadProjects, PROJECTS_UPDATED_EVENT, type Project, type ProjectSynthesis } from '@/projects'
import { CARD_H, CARD_W, RELATIONS, boardShapeUtils, type Relation } from './shapes'
import { LAYOUTS, applyLayout, loadLayout, saveLayout, type LayoutId } from './layouts'
import { downloadWorkspace, importWorkspace, pickWorkspaceFile, resetWorkspace } from './workspace'
import { CommandPalette, type Command } from './CommandPalette'

/** Fit all cards in view without blowing a lone card up past 100%. */
export function fitBoard(editor: Editor, duration = 320) {
  const bounds = editor.getCurrentPageBounds()
  if (bounds) editor.zoomToBounds(bounds, { targetZoom: 1, inset: 64, animation: { duration } })
}

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
<<<<<<< Updated upstream
function syncCards(editor: Editor, papers: ImportedPaper[], summaries: Record<string, string> = {}) {
=======
function syncCards(editor: Editor, papers: ImportedPaper[], summaries: Record<string, string>) {
>>>>>>> Stashed changes
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
    // Fill in summaries that arrived after a card was placed.
    for (const c of cards) {
      const next = summaries[c.props.sourceId]
      if (next && next !== c.props.summary) editor.updateShape({ id: c.id, type: 'source-card', props: { summary: next } })
    }
  }, { history: 'ignore' })
  return added.length
}

function tie(editor: Editor, [a, b]: TLShape[]) {
  const id = createShapeId()
  editor.createShape({ id, type: 'red-string', x: 0, y: 0, props: { fromId: a.id, toId: b.id, relation: '' }, meta: { tiedAt: Date.now() } })
  editor.select(id)
}

type BoardActions = { onOpen: (sourceId: string) => void; onCompare: (a: string, b: string) => void }
const BoardActionsContext = createContext<BoardActions>({ onOpen: () => {}, onCompare: () => {} })

/** Floating actions for the current selection: tie two cards, or name a string's relation. */
function SelectionActions() {
  const editor = useEditor()
  const { onOpen, onCompare } = useContext(BoardActionsContext)
  const selected = useValue('selection', () => editor.getSelectedShapes(), [editor])
  const cards = selected.filter(s => s.type === 'source-card')
  const string = selected.length === 1 && selected[0].type === 'red-string' ? selected[0] : null
  if (cards.length === 2 && selected.length === 2) {
    return <div className="board-actions" role="toolbar" aria-label="Selection actions"><button onClick={() => onCompare(cards[0].props.sourceId, cards[1].props.sourceId)}>Learn how they connect</button><button onClick={() => tie(editor, cards)}>Tie with string</button></div>
  }
  if (cards.length === 1 && selected.length === 1) {
    return <div className="board-actions" role="toolbar" aria-label="Selection actions"><button onClick={() => onOpen(cards[0].props.sourceId)}>Learn this source</button></div>
  }
  if (!string) {
    if (cards.length > 2) return <div className="board-actions" role="toolbar"><span className="board-hint">Select two cards to compare them</span></div>
    return null
  }
  const ends = [string.props.fromId, string.props.toId].map(id => editor.getShape(id as TLShape['id'])).filter(s => s?.type === 'source-card') as TLShape<'source-card'>[]
  const set = (relation: Relation) => editor.updateShape({ id: string.id, type: 'red-string', props: { relation } })
  return (
    <div className="board-actions" role="toolbar" aria-label="String relation">
      {RELATIONS.map(r => <button key={r} aria-pressed={string.props.relation === r} onClick={() => set(string.props.relation === r ? '' : r)}>{r}</button>)}
      {ends.length === 2 && <button onClick={() => onCompare(ends[0].props.sourceId, ends[1].props.sourceId)}>Learn this connection</button>}
      <button onClick={() => editor.deleteShapes([string.id])}>Cut string</button>
    </div>
  )
}

<<<<<<< Updated upstream
export function Board({ papers, summaries = {}, canvasKey = 'margin-board-v1', onOpen, onCompare, onAdd }: { papers: ImportedPaper[]; summaries?: Record<string, string>; canvasKey?: string; onOpen: (sourceId: string) => void; onCompare: (a: string, b: string) => void; onAdd: () => void }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [layout, setLayout] = useState<LayoutId>(loadLayout)

  const switchLayout = (next: LayoutId) => {
    setLayout(next); saveLayout(next)
    if (editor) applyLayout(editor, next)
  }

  const commands = useMemo<Command[]>(() => [
    ...LAYOUTS.map(l => ({ id: `layout-${l.id}`, label: `Layout: ${l.label}`, hint: `Alt+${l.key}`, run: () => switchLayout(l.id) })),
    { id: 'add', label: 'Add material', run: onAdd },
    { id: 'fit', label: 'Zoom to fit', hint: 'Shift+1', run: () => editor && fitBoard(editor) },
    { id: 'export', label: 'Export workspace (JSON)', run: () => editor && downloadWorkspace(editor, layout) },
    { id: 'import', label: 'Import workspace (JSON)', run: () => editor && pickWorkspaceFile().then(f => { importWorkspace(editor, f); setLayout(f.layout); saveLayout(f.layout) }).catch(e => alert(e.message)) },
    { id: 'reset', label: 'Reset workspace', run: () => { if (editor && confirm('Remove all strings and card positions? Your sources stay in the library.')) { resetWorkspace(editor); syncCards(editor, papers) } } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [editor, layout, papers, onAdd])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return
      const l = LAYOUTS.find(l => e.code === `Key${l.key}`)
      if (l) { e.preventDefault(); switchLayout(l.id) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!editor) return
    if (syncCards(editor, papers, summaries)) layout === 'gravity' ? applyLayout(editor, layout) : fitBoard(editor)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, papers, summaries])
=======
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
>>>>>>> Stashed changes

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
    <BoardActionsContext.Provider value={{ onOpen, onCompare }}>
    <div className="board" data-layout={layout}>
      <PersistentTldraw
        canvasKey={canvasKey}
        shapeUtils={boardShapeUtils}
        components={{ MenuPanel: null, NavigationPanel: null, HelperButtons: null, DebugMenu: null, DebugPanel: null, StylePanel: null, InFrontOfTheCanvas: SelectionActions }}
        onMount={ed => {
          setEditor(ed)
          if (import.meta.env.DEV) Object.assign(window, { boardEditor: ed }) // for local UI checks
<<<<<<< Updated upstream
          fitBoard(ed, 0)
        }}
      />
      <CommandPalette commands={commands} />
=======
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
>>>>>>> Stashed changes
      {!papers.length && (
        <div className="board-empty">
          <p>Your board is empty.</p>
          <p className="board-empty-hint">Add papers, notes, slides or recordings. Each one lands here as a card you can tie to others.</p>
          <button onClick={onAdd}>Add material</button>
        </div>
      )}
    </div>
    </BoardActionsContext.Provider>
  )
}

