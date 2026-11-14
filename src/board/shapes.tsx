import { HTMLContainer, Polyline2d, Rectangle2d, ShapeUtil, T, Vec, useEditor, useValue, type TLShape, type TLShapeId } from 'tldraw'
import { IndexCard, IndexCardContent, IndexCardFooter, IndexCardHeader, IndexCardTitle } from '@/components/ui/index-card'
import { LabelTag, LabelTagTitle } from '@/components/ui/label-tag'
import { pinPoint, sagCurve, type Pt } from './sag'

export const RELATIONS = ['supports', 'contradicts', 'extends'] as const
export type Relation = (typeof RELATIONS)[number] | ''

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'source-card': { w: number; h: number; sourceId: string; title: string; kind: string; segments: number; imported: string }
    'red-string': { fromId: string; toId: string; relation: Relation }
  }
}

export type SourceCardShape = TLShape<'source-card'>
export type RedStringShape = TLShape<'red-string'>

export const CARD_W = 300
export const CARD_H = 180

export class SourceCardUtil extends ShapeUtil<SourceCardShape> {
  static override type = 'source-card' as const
  static override props = { w: T.number, h: T.number, sourceId: T.string, title: T.string, kind: T.string, segments: T.number, imported: T.string }
  override canResize = () => false
  override canEdit = () => false
  override hideRotateHandle = () => true
  getDefaultProps(): SourceCardShape['props'] {
    return { w: CARD_W, h: CARD_H, sourceId: '', title: 'Untitled source', kind: 'pdf', segments: 0, imported: '' }
  }
  getGeometry(shape: SourceCardShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }
  component(shape: SourceCardShape) {
    const { w, h, title, kind, segments, imported, sourceId } = shape.props
    return (
      <HTMLContainer className="board-card" style={{ width: w, height: h }}>
        <IndexCard seed={sourceId} size={[w, h]} className="h-full min-h-0 max-w-none select-none">
          <IndexCardHeader><IndexCardTitle title={title}>{title}</IndexCardTitle></IndexCardHeader>
          <IndexCardContent className="board-card-meta">{kind.toUpperCase()} source, {segments} {segments === 1 ? 'section' : 'sections'}</IndexCardContent>
          <IndexCardFooter><span>{imported}</span><span>Double-click to study</span></IndexCardFooter>
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
    <g className="string-pin" transform={`translate(${at.x} ${at.y})`}>
      <ellipse cx={1.5} cy={3} rx={7} ry={4} className="string-pin-shadow" />
      <circle r={6.5} className="string-pin-head" />
      <circle r={2.2} cx={-2} cy={-2} className="string-pin-shine" />
    </g>
  )
}

function RedString({ shape }: { shape: RedStringShape }) {
  const editor = useEditor()
  const ends = useValue('string ends', () => stringEnds(editor, shape), [editor, shape])
  const selected = useValue('string selected', () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id])
  if (!ends) return null
  const { d, mid } = sagCurve(ends[0], ends[1])
  // Only a string tied in the last second draws itself in; reloads and scrolling never replay it.
  const fresh = Date.now() - Number(shape.meta.tiedAt || 0) < 1000
  const { relation } = shape.props
  return (
    <HTMLContainer className={`board-string ${selected ? 'is-selected' : ''}`} style={{ width: 1, height: 1, overflow: 'visible' }}>
      <svg className="board-string-svg" overflow="visible" width={1} height={1}>
        <path d={d} className="string-shadow" />
        <path d={d} pathLength={1} className={`string-thread ${fresh ? 'string-fresh' : ''}`} />
        <path d={d} pathLength={1} className={`string-twist ${fresh ? 'string-fresh' : ''}`} />
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
