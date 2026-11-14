import { useMemo } from 'react'
import { HTMLContainer, Rectangle2d, ShapeUtil, T, type TLShape } from 'tldraw'
import { Paper } from '@/components/ui/paper'
import { stroke } from '@/lib/ink/pen'
import { makeRng } from '@/lib/ink/rng'
import { paint, type PaintKey } from '@/lib/ink/paint'
import type { PenName, Pt } from '@/lib/ink/types'
import type { StockName } from '@/lib/ink/paper/stocks'
import './lessonWidgets.css'

export type WidgetKind = 'table' | 'bar' | 'line' | 'pie' | 'stats' | 'timeline'
export type WidgetData = {
  kind: WidgetKind
  title: string
  labels: string[]
  series: Array<{ name: string; values: number[] }>
  rows: string[][]
  unit: string
}

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    /** A data widget the tutor fills in one action; `shown` (0..1) reveals it progressively while the tutor speaks. */
    'lesson-widget': WidgetData & { w: number; h: number; shown: number }
  }
}
export type LessonWidgetShape = TLShape<'lesson-widget'>

const PENS: PenName[] = ['blue', 'redfelt', 'greenfelt', 'orange']
const TINTS: PaintKey[] = ['sky', 'tomato', 'grass', 'tangerine', 'grape', 'lemon', 'teal', 'bubblegum']
const STOCK: Record<WidgetKind, StockName> = { table: 'ledger', bar: 'graph', line: 'graph', pie: 'paper', stats: 'index-card', timeline: 'paper' }
const HEADER = 46

/** One hand-inked stroke from the Loose Leaf pen engine. Seeded, so it looks the same on every render. */
function InkStroke({ points, pen = 'ink', seed, width }: { points: Pt[]; pen?: PenName; seed: string; width?: number }) {
  const layers = useMemo(() => stroke(points, pen, makeRng(seed), { width }).layers, [points, pen, seed, width])
  return <g>{layers.map((layer, i) => <path key={i} d={layer.d} fill={paint(layer.fill)} opacity={layer.op} fillRule={layer.rule} />)}</g>
}

const fmt = (value: number, unit = '') => `${Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit}`
const reveal = (shown: number, count: number) => Math.ceil(Math.max(0, Math.min(1, shown)) * count)

function Legend({ series }: { series: WidgetData['series'] }) {
  if (series.length < 2) return null
  return <div className="widget-legend">{series.map((s, i) => <span key={i}><i style={{ background: paint(TINTS[i]) }} />{s.name}</span>)}</div>
}

/** Bar and line charts share axes: categories along x, value scale from 0 (or the data minimum, if negative) to the maximum. */
function Chart({ data, w, h, shown, seed }: { data: WidgetData; w: number; h: number; shown: number; seed: string }) {
  const pad = { l: 46, r: 14, t: 10, b: 30 }
  const values = data.series.flatMap(s => s.values)
  const min = Math.min(0, ...values)
  const max = Math.max(...values, min + 1)
  const plotW = w - pad.l - pad.r
  const plotH = h - pad.t - pad.b
  const y = (v: number) => pad.t + plotH * (1 - (v - min) / (max - min))
  const n = data.labels.length
  const slot = plotW / n
  const ticks = [min, (min + max) / 2, max]
  const visible = reveal(shown, n)
  return (
    <svg className="widget-chart" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {ticks.map((t, i) => <text key={i} x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="widget-tick">{fmt(+t.toFixed(2), data.unit)}</text>)}
      <InkStroke seed={`${seed}-y`} points={[[pad.l, pad.t - 4], [pad.l, y(min)]]} />
      <InkStroke seed={`${seed}-x`} points={[[pad.l, y(Math.max(0, min))], [w - pad.r + 4, y(Math.max(0, min))]]} />
      {data.labels.map((label, i) => <text key={i} x={pad.l + slot * (i + 0.5)} y={h - 10} textAnchor="middle" className="widget-tick">{label}</text>)}
      {data.kind === 'bar' ? data.series.map((s, si) => {
        const gap = 4
        const barW = (slot * 0.7 - gap * (data.series.length - 1)) / data.series.length
        return s.values.slice(0, visible).map((v, i) => {
          const x0 = pad.l + slot * i + slot * 0.15 + (barW + gap) * si
          const top = y(Math.max(v, 0)), bottom = y(Math.min(v, 0))
          return (
            <g key={`${si}-${i}`}>
              <rect x={x0} y={top} width={barW} height={Math.max(1, bottom - top)} fill={paint(TINTS[si])} opacity={0.35} />
              {([[[x0, bottom], [x0, top]], [[x0, top], [x0 + barW, top]], [[x0 + barW, top], [x0 + barW, bottom]]] as Pt[][]).map((side, k) =>
                <InkStroke key={k} seed={`${seed}-b${si}-${i}-${k}`} pen={PENS[si % PENS.length]} points={side} width={0.8} />)}
              <text x={x0 + barW / 2} y={top - 5} textAnchor="middle" className="widget-value">{fmt(v, data.unit)}</text>
            </g>
          )
        })
      }) : data.series.map((s, si) => {
        const pts: Pt[] = s.values.slice(0, visible).map((v, i) => [pad.l + slot * (i + 0.5), y(v)])
        return (
          <g key={si}>
            {pts.length > 1 && <InkStroke seed={`${seed}-l${si}`} pen={PENS[si % PENS.length]} points={pts} />}
            {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={3.5} fill={paint(TINTS[si])} stroke={paint('ink')} strokeWidth={1} />)}
          </g>
        )
      })}
    </svg>
  )
}

function Pie({ data, w, h, shown, seed }: { data: WidgetData; w: number; h: number; shown: number; seed: string }) {
  const values = data.series[0]?.values || []
  const total = values.reduce((sum, v) => sum + v, 0) || 1
  const r = Math.min(h / 2 - 8, w * 0.28)
  const cx = r + 12, cy = h / 2
  const visible = reveal(shown, values.length)
  let angle = -Math.PI / 2
  const wedges = values.map((v, i) => {
    const from = angle
    angle += (v / total) * Math.PI * 2
    return { i, v, from, to: angle }
  })
  const at = (a: number, rr = r): Pt => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]
  const circle: Pt[] = Array.from({ length: 49 }, (_, k) => at(-Math.PI / 2 + (k / 48) * Math.PI * 2))
  return (
    <div className="widget-pie">
      <svg width={r * 2 + 24} height={h} viewBox={`0 0 ${r * 2 + 24} ${h}`}>
        {wedges.slice(0, visible).map(({ i, from, to }) => {
          const [x1, y1] = at(from), [x2, y2] = at(to)
          return <path key={i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`} fill={paint(TINTS[i % TINTS.length])} opacity={0.5} />
        })}
        {wedges.slice(0, visible).map(({ i, from }) => <InkStroke key={i} seed={`${seed}-r${i}`} points={[[cx, cy], at(from)]} width={0.7} />)}
        <InkStroke seed={`${seed}-c`} points={circle} />
      </svg>
      <ul className="widget-keys">
        {wedges.map(({ i, v }) => <li key={i} style={{ opacity: i < visible ? 1 : 0 }}><i style={{ background: paint(TINTS[i % TINTS.length]) }} />{data.labels[i]} <b>{Math.round((v / total) * 100)}%</b></li>)}
      </ul>
    </div>
  )
}

function WidgetBody({ data, w, h, shown, seed }: { data: WidgetData; w: number; h: number; shown: number; seed: string }) {
  const bodyH = h - HEADER - 16
  if (data.kind === 'bar' || data.kind === 'line') return <><Chart data={data} w={w - 28} h={bodyH - (data.series.length > 1 ? 22 : 0)} shown={shown} seed={seed} /><Legend series={data.series} /></>
  if (data.kind === 'pie') return <Pie data={data} w={w - 28} h={bodyH} shown={shown} seed={seed} />
  if (data.kind === 'table') return (
    <table className="widget-table">
      <thead><tr>{data.labels.map((label, i) => <th key={i}>{label}</th>)}</tr></thead>
      <tbody>{data.rows.slice(0, reveal(shown, data.rows.length)).map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody>
    </table>
  )
  if (data.kind === 'stats') return (
    <div className="widget-stats">
      {data.labels.map((label, i) => <div key={i} style={{ opacity: i < reveal(shown, data.labels.length) ? 1 : 0 }}><b>{fmt(data.series[0]?.values[i] ?? 0, data.unit)}</b><span>{label}</span></div>)}
    </div>
  )
  return (
    <ol className="widget-timeline">
      {data.rows.slice(0, reveal(shown, data.rows.length)).map(([when, what], i) => <li key={i}><b>{when}</b><span>{what}</span></li>)}
    </ol>
  )
}

/** A filled widget on its Loose Leaf paper. Used by the canvas shape and anywhere else a widget is shown (e.g. the landing page). */
export function WidgetCard({ data, w, h, shown = 1, seed }: { data: WidgetData; w: number; h: number; shown?: number; seed: string }) {
  return (
    <Paper stock={STOCK[data.kind]} seed={seed} size={[w, h]} className="lesson-widget-sheet" style={{ width: w, height: h }}>
      <div className="lesson-widget-title">{data.title}</div>
      <div className="lesson-widget-body"><WidgetBody data={data} w={w} h={h} shown={shown} seed={seed} /></div>
    </Paper>
  )
}

export class LessonWidgetUtil extends ShapeUtil<LessonWidgetShape> {
  static override type = 'lesson-widget' as const
  static override props = {
    w: T.number, h: T.number, shown: T.number,
    kind: T.literalEnum('table', 'bar', 'line', 'pie', 'stats', 'timeline'), title: T.string, unit: T.string,
    labels: T.arrayOf(T.string), rows: T.arrayOf(T.arrayOf(T.string)),
    series: T.arrayOf(T.object({ name: T.string, values: T.arrayOf(T.number) })),
  }
  override canEdit = () => false
  override hideRotateHandle = () => true
  getDefaultProps(): LessonWidgetShape['props'] {
    return { w: 420, h: 280, shown: 1, kind: 'table', title: '', unit: '', labels: [], rows: [], series: [] }
  }
  getGeometry(shape: LessonWidgetShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }
  component(shape: LessonWidgetShape) {
    const { w, h, shown, ...data } = shape.props
    return <HTMLContainer className="lesson-widget" style={{ width: w, height: h }}><WidgetCard data={data} w={w} h={h} shown={shown} seed={shape.id} /></HTMLContainer>
  }
  /** What the tutor reads back when the learner selects or circles the widget. */
  override getText(shape: LessonWidgetShape) {
    const { kind, title, labels, series, rows, unit } = shape.props
    return [`${title} (${kind})`, labels.join(', '), ...series.map(s => `${s.name}: ${s.values.map(v => fmt(v, unit)).join(', ')}`), ...rows.map(row => row.join(' | '))].filter(Boolean).join('\n')
  }
  getIndicatorPath(shape: LessonWidgetShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }
}

export const lessonShapeUtils = [LessonWidgetUtil]
