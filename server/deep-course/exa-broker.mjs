import { tool } from 'langchain'
import { z } from 'zod'
import { backgroundSearchDomains, isReputableSourceUrl } from '../learning-agent.mjs'
import { paths, slug } from './workspace.mjs'

/**
 * One gate for every Exa call in a job. Limits are enforced here, never left to a prompt:
 * - each reader may search at most `perReader` times (tier 1); past that the tool tells it to escalate
 * - the whole job may spend at most `budget` searches (tier 2, used by the coordinator for escalations)
 * - results are cached on disk per concept and shared, and a search already in flight is awaited rather than
 *   repeated, so two readers asking about the same concept at once cost one API call.
 */
export function createExaBroker({ apiKey, workspace, budget = 5, perReader = 1, fetchImpl = fetch }) {
  const inFlight = new Map()
  const perReaderUsed = new Map()
  const stats = { apiCalls: 0, cacheHits: 0, deduped: 0, refused: 0, escalations: 0 }

  async function cached(concept) {
    const text = await workspace.read(paths.ref(concept))
    return text === null ? null : text
  }

  async function callExa(concept) {
    stats.apiCalls++
    const response = await fetchImpl('https://api.exa.ai/search', {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `${concept} explained`, type: 'auto', numResults: 5, includeDomains: backgroundSearchDomains,
        contents: { highlights: true },
      }),
    })
    if (!response.ok) throw new Error(`Background search failed (HTTP ${response.status}).`)
    const result = await response.json()
    const lines = [`# ${concept}`, '']
    for (const item of result.results || []) {
      if (!item?.url || !isReputableSourceUrl(item.url)) continue
      const excerpt = (item.highlights || []).join(' ').trim().slice(0, 900)
      lines.push(`## ${String(item.title || item.url).slice(0, 200)}`, item.url, excerpt, '')
    }
    const markdown = lines.join('\n').trim()
    await workspace.write(paths.ref(concept), markdown)
    return markdown
  }

  /** Cache, then in-flight, then budget. Returns markdown, or null when the job's budget is spent. */
  async function lookup(concept) {
    const key = slug(concept)
    const hit = await cached(concept)
    if (hit !== null) { stats.cacheHits++; return hit }
    if (inFlight.has(key)) { stats.deduped++; return inFlight.get(key) }
    if (!apiKey || stats.apiCalls >= budget) { stats.refused++; return null }
    const pending = callExa(concept).finally(() => inFlight.delete(key))
    inFlight.set(key, pending)
    return pending
  }

  /** The search tool handed to one reader. Its own cap is counted per reader id. */
  function readerTool(readerId) {
    return tool(async ({ concept }) => {
      const used = perReaderUsed.get(readerId) || 0
      const known = await cached(concept)
      if (known !== null) { stats.cacheHits++; return known }
      if (used >= perReader) {
        stats.refused++
        return `LIMIT_ESCALATION: your search for this slice is used up. Do not search again; list "${concept}" in missingConcepts so the coordinator can resolve it.`
      }
      perReaderUsed.set(readerId, used + 1)
      const result = await lookup(concept)
      return result ?? `LIMIT_ESCALATION: the project search budget is spent. List "${concept}" in missingConcepts.`
    }, {
      name: 'search_background',
      description: 'Look up one background concept the slice assumes but does not explain, in scholarly and official sources. You get one search; use it only for a concept the reader cannot follow the slice without.',
      schema: z.object({ concept: z.string().min(3).max(120) }),
    })
  }

  /** Coordinator escalation: resolve concepts readers could not, de-duplicated, within the job budget. */
  async function resolve(concepts) {
    stats.escalations++
    const unique = [...new Map(concepts.map(c => [slug(c), c])).values()]
    const resolved = [], unresolved = []
    for (const concept of unique) {
      const result = await lookup(concept)
      if (result) resolved.push({ concept, path: paths.ref(concept) })
      else unresolved.push(concept)
    }
    return { resolved, unresolved, budgetLeft: Math.max(0, budget - stats.apiCalls) }
  }

  return { readerTool, resolve, lookup, stats }
}
