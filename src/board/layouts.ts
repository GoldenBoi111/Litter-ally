import type { Editor, TLShape } from 'tldraw'
import { CARD_H, CARD_W } from './shapes'

export const LAYOUTS = [
  { id: 'editorial', key: 'A', label: 'Architectural Editorial' },
  { id: 'command', key: 'B', label: 'Spatial Command Center' },
  { id: 'gravity', key: 'C', label: 'Radial Gravity' },
] as const
export type LayoutId = (typeof LAYOUTS)[number]['id']

const STORE = 'litterally-board-layout'
export const loadLayout = (): LayoutId => {
  const v = localStorage.getItem(STORE)
  return LAYOUTS.some(l => l.id === v) ? (v as LayoutId) : 'editorial'
}
export const saveLayout = (id: LayoutId) => localStorage.setItem(STORE, id)

type Pos = { x: number; y: number }

/** Weight = number of strings touching the card; supports count double (consensus), contradicts count once. */
export function cardWeights(shapes: TLShape[]) {
  const w = new Map<string, number>()
  for (const s of shapes) {
    if (s.type !== 'red-string') continue
    const add = s.props.relation === 'supports' ? 2 : 1
    for (const id of [s.props.fromId, s.props.toId]) w.set(id, (w.get(id) || 0) + add)
  }
  return w
}

/** Pure placement: heaviest card at the centre, then concentric rings; unconnected outliers on the outer orbit. */
export function gravityPositions(ids: string[], weights: Map<string, number>): Map<string, Pos> {
  const sorted = [...ids].sort((a, b) => (weights.get(b) || 0) - (weights.get(a) || 0))
  const out = new Map<string, Pos>()
  const linked = sorted.filter(id => (weights.get(id) || 0) > 0)
  const loose = sorted.filter(id => !(weights.get(id) || 0))
  const centre = (p: Pos) => ({ x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 })
  let ring = 0, i = 0
  while (i < linked.length) {
    if (ring === 0) { out.set(linked[i++], centre({ x: 0, y: 0 })); ring++; continue }
    const r = ring * (CARD_W + 80), n = Math.max(6, ring * 6)
    for (let k = 0; k < n && i < linked.length; k++, i++) {
      const a = (2 * Math.PI * k) / n
      out.set(linked[i], centre({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.75 }))
    }
    ring++
  }
  const r = (ring + 1) * (CARD_W + 80)
  loose.forEach((id, k) => {
    const a = (2 * Math.PI * k) / Math.max(1, loose.length) + Math.PI / 8
    out.set(id, centre({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.75 }))
  })
  return out
}

/** Moves cards for the chosen layout. Remembers the free-form positions so switching back restores them; graph data is never touched. */
export function applyLayout(editor: Editor, layout: LayoutId) {
  const shapes = editor.getCurrentPageShapes()
  const cards = shapes.filter(s => s.type === 'source-card')
  if (!cards.length) return
  if (layout === 'gravity') {
    const pos = gravityPositions(cards.map(c => c.id), cardWeights(shapes))
    editor.run(() => editor.updateShapes(cards.map(c => ({
      id: c.id, type: c.type, ...pos.get(c.id)!,
      meta: { ...c.meta, freeX: (c.meta.freeX as number) ?? c.x, freeY: (c.meta.freeY as number) ?? c.y },
    }))))
  } else {
    const back = cards.filter(c => typeof c.meta.freeX === 'number')
    editor.run(() => editor.updateShapes(back.map(c => {
      const { freeX, freeY, ...meta } = c.meta
      return { id: c.id, type: c.type, x: freeX as number, y: freeY as number, meta }
    })))
  }
  editor.zoomToFit({ animation: { duration: 320 } })
}
