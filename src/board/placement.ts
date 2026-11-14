type Box = { x: number; y: number; w: number; h: number }

/** Find the closest free card-sized grid cell to a related source. */
export function openSpotNear(occupied: Box[], preferred: { x: number; y: number }, w: number, h: number) {
  const dx = w + 70, dy = h + 90
  const origin = { x: Math.round(preferred.x / dx) * dx, y: Math.round(preferred.y / dy) * dy }
  for (let radius = 0; ; radius++) {
    for (let row = -radius; row <= radius; row++) for (let col = -radius; col <= radius; col++) {
      if (Math.max(Math.abs(row), Math.abs(col)) !== radius) continue
      const x = origin.x + col * dx, y = origin.y + row * dy
      if (!occupied.some(box => box.x < x + w && x < box.x + box.w && box.y < y + h && y < box.y + box.h)) return { x, y }
    }
  }
}
