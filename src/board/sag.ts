export type Pt = { x: number; y: number }

/** A string pinned at a and b hangs as a quadratic curve; longer strings sag more, capped so long ties stay readable. */
export function sagCurve(a: Pt, b: Pt) {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const sag = Math.min(90, 10 + length * 0.09)
  const control = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag * 2 }
  // Point on the curve at t = 0.5, where the relation tag hangs.
  const mid = { x: (a.x + 2 * control.x + b.x) / 4, y: (a.y + 2 * control.y + b.y) / 4 }
  return { d: `M${a.x},${a.y} Q${control.x},${control.y} ${b.x},${b.y}`, mid, sag }
}

/** Where a card's pin sits, in page space: top centre, just inside the edge. */
export function pinPoint(box: { x: number; y: number; w: number }): Pt {
  return { x: box.x + box.w / 2, y: box.y + 14 }
}
