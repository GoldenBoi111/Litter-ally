import { useEffect, useRef, useState } from 'react'
import './board.css'
import { createShapeId, useEditor, useValue, type Editor, type TLShape } from 'tldraw'
import type { ImportedPaper } from '@/storage'
import { PersistentTldraw } from '@/persistentCanvas'
import type { ProjectSynthesis } from '@/projects'
import { CARD_H, CARD_W, RELATIONS, boardShapeUtils, type Relation } from './shapes'
import { CUT_TOTAL_MS } from './cutRope'
import { desiredConnections, sourcePairKey } from './connections'
import { openSpotNear } from './placement'

const GRID = { cols: 4, dx: CARD_W + 90, dy: CARD_H + 120 }

/** First grid cell whose card slot is empty, so new sources never land on top of moved ones. */
function freeSpot(editor: Editor, preferred?: { x: number; y: number }, ignoreId?: TLShape['id']) {
  const taken = editor.getCurrentPageShapes().filter(s => s.type !== 'red-string' && s.id !== ignoreId).map(s => editor.getShapePageBounds(s)!).filter(Boolean)
  if (preferred) return openSpotNear(taken, preferred, CARD_W, CARD_H)
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
      const spot = freeSpot(editor)
      editor.createShape({
        id, type: 'source-card', ...spot, meta: { autoX: spot.x, autoY: spot.y, pendingCluster: true },
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

/** Reconcile only generated strings; hand-tied strings and learner overrides remain theirs. */
function syncConnections(editor: Editor, synthesis: ProjectSynthesis, hiddenPairs: string[]) {
  const cards = editor.getCurrentPageShapes().filter(s => s.type === 'source-card')
  const bySource = new Map(cards.map(card => [card.props.sourceId, card]))
  const byShape = new Map(cards.map(card => [card.id, card.props.sourceId]))
  const strings = editor.getCurrentPageShapes().filter(s => s.type === 'red-string')
  const manual = new Set(strings.filter(s => !s.meta.autoPair || s.meta.manualOverride).map(s => {
    const a = byShape.get(s.props.fromId as TLShape['id']), b = byShape.get(s.props.toId as TLShape['id'])
    return a && b ? sourcePairKey(a, b) : ''
  }))
  const desired = desiredConnections(synthesis.connections, new Set(bySource.keys()), new Set(hiddenPairs), manual)
  const kept = new Set<string>()
  editor.run(() => {
    for (const string of strings) {
      const pair = string.meta.autoPair
      if (typeof pair !== 'string' || string.meta.manualOverride) continue
      const connection = desired.get(pair)
      if (!connection || kept.has(pair)) { editor.deleteShapes([string.id]); continue }
      kept.add(pair)
      const fromId = bySource.get(connection.leftId)!.id, toId = bySource.get(connection.rightId)!.id
      if (string.props.fromId !== fromId || string.props.toId !== toId || string.props.relation !== connection.relation || string.meta.reason !== connection.reason) {
        editor.updateShape({ id: string.id, type: 'red-string', props: { fromId, toId, relation: connection.relation }, meta: { ...string.meta, reason: connection.reason } })
      }
    }
    for (const [pair, connection] of desired) {
      if (kept.has(pair)) continue
      editor.createShape({ id: createShapeId(), type: 'red-string', x: 0, y: 0,
        props: { fromId: bySource.get(connection.leftId)!.id, toId: bySource.get(connection.rightId)!.id, relation: connection.relation },
        meta: { autoPair: pair, reason: connection.reason, tiedAt: desired.size <= 24 ? Date.now() : 0 },
      })
    }
  }, { history: 'ignore' })
}

/** Give a newly imported, untouched card one nearby slot once its relationships are known. */
function clusterNewCards(editor: Editor, synthesis: ProjectSynthesis) {
  let moved = false
  for (const card of editor.getCurrentPageShapes().filter(s => s.type === 'source-card' && s.meta.pendingCluster)) {
    const current = editor.getShape(card.id)
    if (!current || current.type !== 'source-card') continue
    if (current.x !== current.meta.autoX || current.y !== current.meta.autoY) {
      editor.updateShape({ id: current.id, type: 'source-card', meta: { ...current.meta, pendingCluster: false } })
      continue
    }
    const neighbors = synthesis.connections.flatMap(link => link.leftId === current.props.sourceId ? [link.rightId] : link.rightId === current.props.sourceId ? [link.leftId] : [])
      .map(id => editor.getCurrentPageShapes().find(s => s.type === 'source-card' && s.props.sourceId === id)).filter((shape): shape is typeof card => !!shape)
    if (!neighbors.length) continue
    const preferred = { x: neighbors.reduce((sum, item) => sum + item.x, 0) / neighbors.length, y: neighbors.reduce((sum, item) => sum + item.y, 0) / neighbors.length }
    const close = Math.abs(current.x - preferred.x) <= GRID.dx && Math.abs(current.y - preferred.y) <= GRID.dy
    const spot = close ? { x: current.x, y: current.y } : freeSpot(editor, preferred, current.id)
    editor.updateShape({ id: current.id, type: 'source-card', ...spot, meta: { ...current.meta, pendingCluster: false } })
    moved ||= spot.x !== current.x || spot.y !== current.y
  }
  return moved
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
  const set = (relation: Relation) => editor.updateShape({ id: string.id, type: 'red-string', props: { relation }, meta: { ...string.meta, manualOverride: true, reason: '' } })
  return (
    <div className="board-actions" role="toolbar" aria-label="String relation">
      {RELATIONS.map(r => <button key={r} aria-pressed={string.props.relation === r} onClick={() => set(string.props.relation === r ? '' : r)}>{r}</button>)}
      <button onClick={() => cutString(editor, string)}>Cut string</button>
      {typeof string.meta.reason === 'string' && string.meta.reason && <span className="board-action-reason">{string.meta.reason}</span>}
    </div>
  )
}

export function Board({ canvasKey, papers, summaries, synthesis, hiddenConnectionPairs, analysisStatus, analysisError, onRetry, onHideConnection, onRestoreConnection, onRestoreHiddenConnections, onOpen, onCompare, onAdd }: {
  canvasKey: string; papers: ImportedPaper[]; summaries: Record<string, string>; synthesis: ProjectSynthesis | null
  hiddenConnectionPairs: string[]; analysisStatus: string | null; analysisError: string | null
  onRetry: () => void; onHideConnection: (pair: string) => void; onRestoreConnection: (pair: string) => void; onRestoreHiddenConnections: () => void
  onOpen: (sourceId: string) => void; onCompare: (leftId: string, rightId: string) => void; onAdd: () => void
}) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const fitted = useRef(false)
  const syncing = useRef(false)
  const hiddenRef = useRef(new Set(hiddenConnectionPairs))
  hiddenRef.current = new Set(hiddenConnectionPairs)

  useEffect(() => {
    if (!editor) return
    syncing.current = true
    let added = 0
    try { added = syncCards(editor, papers, summaries) } finally { syncing.current = false }
    if (papers.length && (!fitted.current || added)) editor.zoomToFit({ animation: { duration: 320 } })
    if (papers.length) fitted.current = true
  }, [editor, papers, summaries])

  useEffect(() => {
    if (!editor || !synthesis) return
    syncing.current = true
    try { syncConnections(editor, synthesis, hiddenConnectionPairs) } finally { syncing.current = false }
    if (clusterNewCards(editor, synthesis)) editor.zoomToFit({ animation: { duration: 320 } })
  }, [editor, synthesis, hiddenConnectionPairs])

  useEffect(() => {
    if (!editor) return
    const offDelete = editor.sideEffects.registerAfterDeleteHandler('shape', shape => {
      if (shape.type === 'red-string' && typeof shape.meta.autoPair === 'string' && !syncing.current) {
        hiddenRef.current.add(shape.meta.autoPair)
        onHideConnection(shape.meta.autoPair)
      }
      if (shape.type !== 'source-card') return
      const loose = editor.getCurrentPageShapes().filter(s => s.type === 'red-string' && (s.props.fromId === shape.id || s.props.toId === shape.id))
      if (loose.length) {
        const wasSyncing = syncing.current
        syncing.current = true
        try { editor.deleteShapes(loose.map(s => s.id)) } finally { syncing.current = wasSyncing }
      }
    })
    const offCreate = editor.sideEffects.registerAfterCreateHandler('shape', shape => {
      if (shape.type === 'red-string' && typeof shape.meta.autoPair === 'string' && hiddenRef.current.has(shape.meta.autoPair)) {
        hiddenRef.current.delete(shape.meta.autoPair)
        onRestoreConnection(shape.meta.autoPair)
      }
    })
    // HTML shapes report double-clicks as hitting the canvas, so find the card under the pointer.
    const onEvent = (info: { name: string; phase?: string }) => {
      if (info.name !== 'double_click' || info.phase !== 'up') return
      const card = editor.getShapesAtPoint(editor.inputs.getCurrentPagePoint(), { hitInside: true }).find(s => s.type === 'source-card')
      if (card) onOpen(card.props.sourceId)
    }
    editor.on('event', onEvent as never)
    return () => { offDelete(); offCreate(); editor.off('event', onEvent as never) }
  }, [editor, onOpen, onHideConnection, onRestoreConnection])

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
      {papers.length > 0 && <button className="board-fit" onClick={() => editor?.zoomToFit({ animation: { duration: 320 } })}>Fit board</button>}
      {(analysisError || analysisStatus) && <div className="board-analysis" role="status">{analysisError ? <>{analysisError} <button onClick={onRetry}>Retry connections</button></> : analysisStatus}</div>}
      {synthesis && <details className="board-connections">
        <summary>Connections ({synthesis.connections.length})</summary>
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
        {hiddenConnectionPairs.length > 0 && <button className="board-restore" onClick={onRestoreHiddenConnections}>Restore {hiddenConnectionPairs.length} hidden {hiddenConnectionPairs.length === 1 ? 'connection' : 'connections'}</button>}
      </details>}
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
