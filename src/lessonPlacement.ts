type Box = { x: number; y: number; w: number; h: number }

/** Keep a new mark in its column, below anything it would cover. */
export function clearVerticalOverlap(mark: Box, occupied: Box[]) {
  let y = mark.y
  for (let attempt = 0; attempt <= occupied.length; attempt++) {
    let nextY = y
    for (const box of occupied) {
      if (mark.x < box.x + box.w + 24 && mark.x + mark.w > box.x - 24 &&
          y < box.y + box.h + 24 && y + mark.h > box.y - 24) {
        nextY = Math.max(nextY, box.y + box.h + 48)
      }
    }
    if (nextY === y) break
    y = nextY
  }
  return y
}
