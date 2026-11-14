import { useLayoutEffect, useRef } from 'react'
import { HTMLContainer, Polyline2d, Rectangle2d, ShapeUtil, T, Vec, useEditor, useValue, type TLShape, type TLShapeId } from 'tldraw'
import { IndexCard, IndexCardContent, IndexCardFooter, IndexCardHeader, IndexCardTitle } from '@/components/ui/index-card'
import { LabelTag, LabelTagTitle } from '@/components/ui/label-tag'
import { pinPoint, sagCurve, type Pt } from './sag'
import { CUT_DISSOLVE_MS, CUT_FALL_MS, CUT_TOTAL_MS, cutRopes, ropePath, stepRope } from './cutRope'

export const RELATIONS = ['supports', 'contradicts', 'extends'] as const
export type Relation = (typeof RELATIONS)[number] | ''

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'source-card': { w: number; h: number; sourceId: string; title: string; kind: string; segments: number; imported: string; summary: string }
    'red-string': { fromId: string; toId: string; relation: Relation }
  }
}

export type SourceCardShape = TLShape<'source-card'>
export type RedStringShape = TLShape<'red-string'>

export const CARD_W = 300
export const CARD_H = 210

export class SourceCardUtil extends ShapeUtil<SourceCardShape> {
  static override type = 'source-card' as const
  static override props = { w: T.number, h: T.number, sourceId: T.string, title: T.string, kind: T.string, segments: T.number, imported: T.string, summary: T.string }
  override canResize = () => false
  override canEdit = () => false
  override hideRotateHandle = () => true
  getDefaultProps(): SourceCardShape['props'] {
    return { w: CARD_W, h: CARD_H, sourceId: '', title: 'Untitled source', kind: 'pdf', segments: 0, imported: '', summary: '' }
  }
  getGeometry(shape: SourceCardShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }
  component(shape: SourceCardShape) {
    const { w, h, title, kind, segments, sourceId, summary } = shape.props
    return (
      <HTMLContainer className="board-card" style={{ width: w, height: h }}>
        <IndexCard seed={sourceId} size={[w, h]} className="h-full min-h-0 max-w-none select-none">
          <IndexCardHeader><IndexCardTitle title={title}>{title}</IndexCardTitle></IndexCardHeader>
          <IndexCardContent className="board-card-summary">{summary || 'Reading this source…'}</IndexCardContent>
          <IndexCardFooter><span>{kind.toUpperCase()} · {segments} {segments === 1 ? 'section' : 'sections'}</span><span>Double-click to learn</span></IndexCardFooter>
        </IndexCard>
      </HTMLContainer>
    )
  }
  getIndicatorPath(shape: SourceCardShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 4)
    return path
  }
}

/** Both pin points of a string in page space, or null once either card is gone. */
function stringEnds(editor: ShapeUtil['editor'], shape: RedStringShape): [Pt, Pt] | null {
  const a = editor.getShapePageBounds(shape.props.fromId as TLShapeId)
  const b = editor.getShapePageBounds(shape.props.toId as TLShapeId)
  return a && b ? [pinPoint({ x: a.x, y: a.y, w: a.w }), pinPoint({ x: b.x, y: b.y, w: b.w })] : null
}

function Pin({ at }: { at: Pt }) {
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <g className="string-pin">
        <ellipse cx={1.5} cy={3} rx={7} ry={4} className="string-pin-shadow" />
        <circle r={6.5} className="string-pin-head" />
        <circle r={2.2} cx={-2} cy={-2} className="string-pin-shine" />
      </g>
    </g>
  )
}

function RedString({ shape }: { shape: RedStringShape }) {
  const editor = useEditor()
  const ends = useValue('string ends', () => stringEnds(editor, shape), [editor, shape])
  const selected = useValue('string selected', () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id])
  // A cut string snaps at the middle, both halves drop and hang from their pins, then dissolve before Board removes it.
  // The window is just past the animation, so a cut that is undone later comes back whole.
  const cut = Date.now() - Number(shape.meta.cutAt || 0) < CUT_TOTAL_MS + 150
  const still = cut && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const svg = useRef<SVGSVGElement>(null)
  const body = useRef<SVGGElement>(null)
  const warp = useRef<SVGFEDisplacementMapElement>(null)
  const halves = useRef<{ shadow: SVGPathElement | null; thread: SVGPathElement | null; twist: SVGPathElement | null }[]>([{ shadow: null, thread: null, twist: null }, { shadow: null, thread: null, twist: null }])
  useLayoutEffect(() => {
    const at = stringEnds(editor, shape)
    if (!cut || still || !at) return
    const ropes = cutRopes(at[0], sagCurve(at[0], at[1]).control, at[1])
    const draw = () => ropes.forEach((rope, i) => {
      const d = ropePath(rope.points)
      for (const path of Object.values(halves.current[i])) path?.setAttribute('d', d)
    })
    draw()
    const dt = 1 / 120
    const start = performance.now()
    let last = start, carry = 0, dissolving = false, frame = 0
    const tick = (now: number) => {
      carry += Math.min(now - last, 50) / 1000
      last = now
      for (; carry >= dt; carry -= dt) ropes.forEach(rope => stepRope(rope, dt))
      draw()
      const elapsed = now - start
      if (elapsed >= CUT_FALL_MS) {
        if (!dissolving) {
          dissolving = true
          svg.current?.classList.add('is-dissolving')
          body.current?.setAttribute('filter', `url(#${filter})`)
        }
        const t = Math.min(1, (elapsed - CUT_FALL_MS) / CUT_DISSOLVE_MS)
        warp.current?.setAttribute('scale', String(38 * (1 - (1 - t) ** 3)))
      }
      if (elapsed < CUT_TOTAL_MS) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Runs once per cut; the halves own their geometry from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut, still])
  const filter = `string-dissolve-${shape.id.replace(/\W/g, '')}`
  if (!ends) return null
  const { d, mid } = sagCurve(ends[0], ends[1])
  // Only a string tied in the last second draws itself in; reloads and scrolling never replay it.
  const fresh = Date.now() - Number(shape.meta.tiedAt || 0) < 1000
  const { relation } = shape.props
  const falling = cut && !still
  return (
    <HTMLContainer className={`board-string ${selected ? 'is-selected' : ''} ${cut ? 'is-cut' : ''}`} style={{ width: 1, height: 1, overflow: 'visible' }}>
      <svg ref={svg} className="board-string-svg" overflow="visible" width={1} height={1}>
        {falling ? (
          <>
            <filter id={filter} x="-50%" y="-20%" width="200%" height="140%">
              <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={2} seed={Number(shape.meta.cutAt) % 97} result="noise" />
              <feDisplacementMap ref={warp} in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            {halves.current.map((half, i) => <path key={i} ref={el => { half.shadow = el }} className="string-shadow" />)}
            <g ref={body} className="string-body">
              {halves.current.map((half, i) => (
                <g key={i}>
                  <path ref={el => { half.thread = el }} pathLength={1} className="string-thread" />
                  <path ref={el => { half.twist = el }} pathLength={1} className="string-twist" />
                </g>
              ))}
            </g>
          </>
        ) : (
          <>
            <path d={d} className="string-shadow" />
            <path d={d} pathLength={1} className={`string-thread ${fresh ? 'string-fresh' : ''}`} />
            <path d={d} pathLength={1} className={`string-twist ${fresh ? 'string-fresh' : ''}`} />
          </>
        )}
        <Pin at={ends[0]} />
        <Pin at={ends[1]} />
      </svg>
      {relation && (
        <div className="board-string-tag" style={{ left: mid.x, top: mid.y }} data-relation={relation}>
          <LabelTag shape="round" string={14} stock={relation === 'contradicts' ? 'sticky-pink' : 'kraft'} seed={shape.id} className="w-auto min-h-0 px-3 pt-9 pb-2">
            <LabelTagTitle className="text-base">{relation}</LabelTagTitle>
          </LabelTag>
        </div>
      )}
    </HTMLContainer>
  )
}

export class RedStringUtil extends ShapeUtil<RedStringShape> {
  static override type = 'red-string' as const
  static override props = { fromId: T.string, toId: T.string, relation: T.literalEnum('', ...RELATIONS) }
  override canResize = () => false
  override canEdit = () => false
  override canCull = () => false
  override hideRotateHandle = () => true
  override hideSelectionBoundsFg = () => true
  override hideSelectionBoundsBg = () => true
  getDefaultProps(): RedStringShape['props'] {
    return { fromId: '', toId: '', relation: '' }
  }
  getGeometry(shape: RedStringShape) {
    const ends = stringEnds(this.editor, shape)
    if (!ends) return new Polyline2d({ points: [new Vec(0, 0), new Vec(1, 1)] })
    const [a, b] = ends
    const c = sagCurve(a, b).control
    const points = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16
      return new Vec((1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y)
    })
    return new Polyline2d({ points })
  }
  component(shape: RedStringShape) {
    return <RedString shape={shape} />
  }
  // The string thickens when selected instead of getting a second, blue outline.
  getIndicatorPath() {
    return undefined
  }
}

export const boardShapeUtils = [SourceCardUtil, RedStringUtil]
