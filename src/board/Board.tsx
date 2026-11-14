import { useEffect, useState } from 'react'
import './board.css'
import { Tldraw, createShapeId, useEditor, useValue, type Editor, type TLShape } from 'tldraw'
import type { ImportedPaper } from '@/storage'
import { CARD_H, CARD_W, RELATIONS, boardShapeUtils, type Relation } from './shapes'

const GRID = { cols: 4, dx: CARD_W + 90, dy: CARD_H + 120 }

/** First grid cell whose card slot is empty, so new sources never land on top of moved ones. */
function freeSpot(editor: Editor) {
  const taken = editor.getCurrentPageShapes().filter(s => s.type === 'source-card').map(s => editor.getShapePageBounds(s)!)
  for (let i = 0; ; i++) {
    const x = (i % GRID.cols) * GRID.dx, y = Math.floor(i / GRID.cols) * GRID.dy
    if (!taken.some(b => b.x < x + CARD_W && x < b.x + b.w && b.y < y + CARD_H && y < b.y + b.h)) return { x, y }
  }
}

function syncCards(editor: Editor, papers: ImportedPaper[]) {
  const cards = editor.getCurrentPageShapes().filter(s => s.type === 'source-card')
  const onBoard = new Set(cards.map(c => c.props.sourceId))
  const live = new Set(papers.map(p => p.id))
  editor.run(() => {
    editor.deleteShapes(cards.filter(c => !live.has(c.props.sourceId)).map(c => c.id))
    for (const paper of papers) {
      if (onBoard.has(paper.id)) continue
      editor.createShape({
        id: createShapeId(), type: 'source-card', ...freeSpot(editor),
        props: { sourceId: paper.id, title: paper.title, kind: paper.sourceKind || 'pdf', segments: paper.pageCount, imported: new Date(paper.importedAt).toLocaleDateString() },
      })
    }
  }, { history: 'ignore' })
}

function tie(editor: Editor, [a, b]: TLShape[]) {
  const id = createShapeId()
  editor.createShape({ id, type: 'red-string', x: 0, y: 0, props: { fromId: a.id, toId: b.id, relation: '' }, meta: { tiedAt: Date.now() } })
  editor.sendToBack([id])
  editor.select(id)
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
      <button onClick={() => editor.deleteShapes([string.id])}>Cut string</button>
    </div>
  )
}

export function Board({ papers, onOpen, onAdd }: { papers: ImportedPaper[]; onOpen: (sourceId: string) => void; onAdd: () => void }) {
  const [editor, setEditor] = useState<Editor | null>(null)

  useEffect(() => { if (editor) syncCards(editor, papers) }, [editor, papers])

  useEffect(() => {
    if (!editor) return
    const offDelete = editor.sideEffects.registerAfterDeleteHandler('shape', shape => {
      if (shape.type !== 'source-card') return
      const loose = editor.getCurrentPageShapes().filter(s => s.type === 'red-string' && (s.props.fromId === shape.id || s.props.toId === shape.id))
      if (loose.length) editor.deleteShapes(loose.map(s => s.id))
    })
    const onEvent = (info: { name: string; target?: string; shape?: TLShape }) => {
      if (info.name === 'double_click' && info.target === 'shape' && info.shape?.type === 'source-card') onOpen(info.shape.props.sourceId)
    }
    editor.on('event', onEvent as never)
    return () => { offDelete(); editor.off('event', onEvent as never) }
  }, [editor, onOpen])

  return (
    <div className="board">
      <Tldraw
        persistenceKey="margin-board-v1"
        shapeUtils={boardShapeUtils}
        components={{ PageMenu: null, DebugMenu: null, DebugPanel: null, StylePanel: null, InFrontOfTheCanvas: SelectionActions }}
        onMount={ed => {
          setEditor(ed)
          if (import.meta.env.DEV) Object.assign(window, { boardEditor: ed }) // for local UI checks
          ed.zoomToFit({ animation: { duration: 0 } })
        }}
      />
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

