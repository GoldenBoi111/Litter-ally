import type { ProjectConnection } from '../projects'

export function sourcePairKey(a: string, b: string) {
  return JSON.stringify(a < b ? [a, b] : [b, a])
}

export function desiredConnections(connections: ProjectConnection[], sources: ReadonlySet<string>, hidden: ReadonlySet<string>, manual: ReadonlySet<string>) {
  const desired = new Map<string, ProjectConnection>()
  for (const connection of connections) {
    const { leftId, rightId } = connection
    if (leftId === rightId || !sources.has(leftId) || !sources.has(rightId)) continue
    const pair = sourcePairKey(leftId, rightId)
    if (!hidden.has(pair) && !manual.has(pair)) desired.set(pair, connection)
  }
  return desired
}
