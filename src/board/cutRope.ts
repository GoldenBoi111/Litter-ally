import type { Pt } from './sag'

/** A cut string drops and swings for CUT_FALL_MS, then dissolves while still hanging. */
export const CUT_FALL_MS = 1250
export const CUT_DISSOLVE_MS = 700
export const CUT_TOTAL_MS = CUT_FALL_MS + CUT_DISSOLVE_MS

/** One half of a cut string: a chain of points whose first point stays on its pin. */
export type Rope = { points: Pt[]; prev: Pt[]; rest: number[] }

const GRAVITY = 2600
const DAMPING = 0.976
const ITERATIONS = 14

function onCurve(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }
}

/** Splits the sagging string (pinned at a and b, bowed toward c) at its midpoint into two ropes, each starting at its pin. */
export function cutRopes(a: Pt, c: Pt, b: Pt, segments = 14): [Rope, Rope] {
  const all = Array.from({ length: segments * 2 + 1 }, (_, i) => onCurve(a, c, b, i / (segments * 2)))
  const halves = [all.slice(0, segments + 1), all.slice(segments).reverse()]
  const ropes = halves.map(points => {
    const rest = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
    const prev = points.map(p => ({ ...p }))
    // The cut end springs back toward its pin a little, like a thread under tension.
    const end = points.length - 1
    const pin = points[0]
    const away = Math.hypot(points[end].x - pin.x, points[end].y - pin.y) || 1
    prev[end] = { x: points[end].x + ((points[end].x - pin.x) / away) * 5, y: points[end].y + 3 }
    return { points: points.map(p => ({ ...p })), prev, rest }
  })
  return [ropes[0], ropes[1]]
}

/** Advances a rope by dt seconds with Verlet integration; the pin end never moves. */
export function stepRope(rope: Rope, dt: number) {
  const { points, prev, rest } = rope
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    const vx = (p.x - prev[i].x) * DAMPING
    const vy = (p.y - prev[i].y) * DAMPING
    prev[i] = { x: p.x, y: p.y }
    points[i] = { x: p.x + vx, y: p.y + vy + GRAVITY * dt * dt }
  }
  for (let k = 0; k < ITERATIONS; k++) {
    for (let i = 0; i < rest.length; i++) {
      const a = points[i], b = points[i + 1]
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.hypot(dx, dy) || 1e-6
      const diff = (dist - rest[i]) / dist
      if (i === 0) {
        points[1] = { x: b.x - dx * diff, y: b.y - dy * diff }
      } else {
        points[i] = { x: a.x + dx * diff * 0.5, y: a.y + dy * diff * 0.5 }
        points[i + 1] = { x: b.x - dx * diff * 0.5, y: b.y - dy * diff * 0.5 }
      }
    }
  }
}

/** A smooth SVG path through the rope's points (midpoint quadratic smoothing). */
export function ropePath(points: Pt[]) {
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], n = points[i + 1]
    d += ` Q${p.x.toFixed(1)},${p.y.toFixed(1)} ${((p.x + n.x) / 2).toFixed(1)},${((p.y + n.y) / 2).toFixed(1)}`
  }
  const last = points[points.length - 1]
  return `${d} L${last.x.toFixed(1)},${last.y.toFixed(1)}`
}
