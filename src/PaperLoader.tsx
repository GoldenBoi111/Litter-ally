import { useEffect, useRef } from 'react'

/** Waiting screen: a crumpled sheet smooths itself out, then a pencil writes notes about the lesson on it.
 * The sheet's unfolding is CSS (pages.css, .paper-loader*); the writing is driven per frame from the same
 * 12s clock so the pencil tip sits exactly where each letter is being revealed. */
const LOOP_MS = 12_000
const BASELINES = [80, 108, 136, 164, 192]
/** Fraction of the loop during which each line is written (matches the old ink timing; sheet is flat by 0.40). */
const WINDOWS: Array<[number, number]> = [[0.42, 0.52], [0.53, 0.62], [0.63, 0.72], [0.73, 0.82], [0.83, 0.89]]
const X0 = 28
const MAX_CHARS = 24

function fit(line: string) {
  const clean = line.replace(/\s+/g, ' ').trim()
  return clean.length > MAX_CHARS ? `${clean.slice(0, MAX_CHARS - 1).trimEnd()}…` : clean
}

export function PaperLoader({ label = 'Preparing your lesson…', compact = false, lines = [] }: { label?: string; compact?: boolean; lines?: string[] }) {
  const sheet = useRef<HTMLDivElement>(null)
  const pencil = useRef<SVGSVGElement>(null)
  const texts = useRef<Array<SVGTextElement | null>>([])
  const clips = useRef<Array<SVGRectElement | null>>([])
  const written = [...lines.filter(Boolean).map(fit), 'notes…', 'key ideas', 'examples', 'how it fits', 'questions?'].slice(0, BASELINES.length)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const started = performance.now()
    let frame = 0
    const widths = texts.current.map(t => (t ? t.getComputedTextLength() : 0))
    const tick = () => {
      // Follow the sheet's CSS animation clock when available so writing never drifts from the unfolding.
      const css = sheet.current?.getAnimations?.()[0]?.currentTime
      const ms = typeof css === 'number' ? css : performance.now() - started
      const t = reduce ? 0.9 : (ms % LOOP_MS) / LOOP_MS
      let tip: { x: number; y: number } | null = null
      WINDOWS.forEach(([a, b], i) => {
        const p = t < a ? 0 : t >= b ? 1 : (t - a) / (b - a)
        const w = widths[i] || 0
        clips.current[i]?.setAttribute('width', String(t > 0.97 ? 0 : p * w + (p > 0 ? 2 : 0)))
        if (p > 0 && p < 1) tip = { x: X0 + p * w, y: BASELINES[i] + Math.sin(p * w * 0.9) * 2.2 - 3 }
      })
      const el = pencil.current
      if (el) {
        const visible = !reduce && t > 0.4 && t < 0.91
        // Between lines the pencil rests at the start of the next one.
        const rest = WINDOWS.findIndex(([a]) => t < a)
        const at = tip ?? (rest >= 0 ? { x: X0, y: BASELINES[rest] - 3 } : { x: X0 + (widths[4] || 60), y: BASELINES[4] - 3 })
        // The tip of the pencil drawing is at (6, 34) inside its 40x40 box.
        el.style.transform = `translate(${at.x - 6}px, ${at.y - 34}px)`
        el.style.opacity = visible ? '1' : '0'
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [written.join('|')])

  return (
    <div className={`paper-loader ${compact ? 'is-compact' : ''}`} role="status" aria-live="polite">
      <div className="paper-loader-stage" aria-hidden="true">
        <div className="paper-loader-sheet" ref={sheet}>
          <svg viewBox="0 0 220 260" className="paper-loader-svg">
            <defs>
              {written.map((_, i) => <clipPath key={i} id={`pl-clip-${i}`}><rect ref={el => { clips.current[i] = el }} x={X0 - 2} y={BASELINES[i] - 22} width="0" height="30" /></clipPath>)}
            </defs>
            <g className="paper-loader-rules">
              {[80, 108, 136, 164, 192, 220].map(y => <line key={y} x1="20" x2="200" y1={y + 4} y2={y + 4} />)}
              <line className="margin" x1="22" x2="22" y1="20" y2="245" />
            </g>
            <g className="paper-loader-creases">
              <path d="M10,40 L95,120 L210,70" /><path d="M30,250 L110,140 L200,210" /><path d="M95,120 L110,140" /><path d="M0,150 L70,175 L110,140" /><path d="M60,0 L80,60 L95,120" /><path d="M160,0 L140,55 L210,70" /><path d="M0,90 L45,100 L95,120" /><path d="M220,140 L170,150 L110,140" /><path d="M120,260 L130,200 L110,140" /><path d="M45,100 L30,60" /><path d="M140,55 L120,30" /><path d="M170,150 L190,110" /><path d="M70,175 L60,230" /><path d="M130,200 L175,235" />
            </g>
            <g className="paper-loader-ink">
              {written.map((line, i) => (
                <text key={i} ref={el => { texts.current[i] = el }} x={X0} y={BASELINES[i]} clipPath={`url(#pl-clip-${i})`} className={i === 0 ? 'is-title' : ''}>{line}</text>
              ))}
            </g>
          </svg>
        </div>
        <svg ref={pencil} className="paper-loader-pencil" viewBox="0 0 40 40"><path d="M6 34 L9 25 L28 6 L34 12 L15 31 Z" /><path className="tip" d="M6 34 L9 25 L15 31 Z" /><path className="eraser" d="M28 6 L31 3 L37 9 L34 12 Z" /></svg>
      </div>
      <p className="paper-loader-label">{label}</p>
    </div>
  )
}
