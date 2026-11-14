import { isReputableSourceUrl } from './learning-agent.mjs'

export function validateTeachingPlan(value, pageCount) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.sessions)) {
    throw new Error('OpenAI returned an invalid teaching plan.')
  }

  for (const checkpoint of value.sessions) {
    if (!Array.isArray(checkpoint?.sourcePages) || checkpoint.sourcePages.some(page => !Number.isInteger(page) || page < 1 || page > pageCount)) {
      throw new Error(`A teaching checkpoint references a page outside this ${pageCount}-page paper.`)
    }
    if (checkpoint.backgroundSources !== undefined && (!Array.isArray(checkpoint.backgroundSources) || checkpoint.backgroundSources.length > 4 || checkpoint.backgroundSources.some(source =>
      !source || typeof source.title !== 'string' || source.title.length > 240 || !isReputableSourceUrl(source.url) || typeof source.relevance !== 'string' || source.relevance.length > 300))) {
      throw new Error('A teaching checkpoint contains an invalid background citation.')
    }
    if (checkpoint.backgroundNotes !== undefined && (typeof checkpoint.backgroundNotes !== 'string' || checkpoint.backgroundNotes.length > 1800)) {
      throw new Error('A teaching checkpoint contains invalid background notes.')
    }
  }

  if (value.conceptMap !== undefined) {
    if (!Array.isArray(value.conceptMap)) throw new Error('The teaching plan has an invalid concept map.')
    const byId = new Map()
    for (const concept of value.conceptMap) {
      if (!concept || typeof concept.id !== 'string' || !concept.id.trim() || byId.has(concept.id) ||
          typeof concept.name !== 'string' || !concept.name.trim() || typeof concept.explanation !== 'string' || !concept.explanation.trim() ||
          !Array.isArray(concept.sourcePages) || !concept.sourcePages.length ||
          concept.sourcePages.some(page => !Number.isInteger(page) || page < 1 || page > pageCount) || !Array.isArray(concept.prerequisites)) {
        throw new Error('The teaching plan has an invalid concept map entry.')
      }
      byId.set(concept.id, concept)
    }

    const indegree = new Map([...byId.keys()].map(id => [id, 0]))
    const dependents = new Map([...byId.keys()].map(id => [id, []]))
    for (const concept of value.conceptMap) {
      const seen = new Set()
      for (const prerequisite of concept.prerequisites) {
        if (!prerequisite || typeof prerequisite.id !== 'string' || typeof prerequisite.reason !== 'string' || !prerequisite.reason.trim() ||
            !['explicit', 'inferred'].includes(prerequisite.relationType) || !Array.isArray(prerequisite.evidencePages) || !prerequisite.evidencePages.length ||
            prerequisite.evidencePages.some(page => !Number.isInteger(page) || page < 1 || page > pageCount) ||
            !byId.has(prerequisite.id) || prerequisite.id === concept.id || seen.has(prerequisite.id)) {
          throw new Error(`Concept “${concept.name}” has an invalid prerequisite.`)
        }
        seen.add(prerequisite.id)
        indegree.set(concept.id, indegree.get(concept.id) + 1)
        dependents.get(prerequisite.id).push(concept.id)
      }
    }

    const originalOrder = new Map(value.conceptMap.map((concept, index) => [concept.id, index]))
    const ready = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id)
    const orderedIds = []
    while (ready.length) {
      ready.sort((a, b) => originalOrder.get(a) - originalOrder.get(b))
      const id = ready.shift()
      orderedIds.push(id)
      for (const dependent of dependents.get(id)) {
        indegree.set(dependent, indegree.get(dependent) - 1)
        if (indegree.get(dependent) === 0) ready.push(dependent)
      }
    }
    if (orderedIds.length !== byId.size) throw new Error('The teaching plan concept map contains a prerequisite cycle.')
    value.conceptMap = orderedIds.map(id => byId.get(id))

    const conceptOrder = new Map(orderedIds.map((id, index) => [id, index]))
    const owners = new Map()
    for (const [index, checkpoint] of value.sessions.entries()) {
      if (!Array.isArray(checkpoint.conceptIds) || !checkpoint.conceptIds.length || new Set(checkpoint.conceptIds).size !== checkpoint.conceptIds.length ||
          checkpoint.conceptIds.some(id => !conceptOrder.has(id))) {
        throw new Error(`Checkpoint “${checkpoint.title}” has invalid concept references.`)
      }
      checkpoint.conceptIds.sort((a, b) => conceptOrder.get(a) - conceptOrder.get(b))
      checkpoint.concepts = checkpoint.conceptIds.map(id => byId.get(id).name)
      for (const id of checkpoint.conceptIds) if (!owners.has(id)) owners.set(id, index)
    }
    if (orderedIds.some(id => !owners.has(id))) throw new Error('Every mapped concept must be taught in a checkpoint.')

    const sessionIndegree = new Map(value.sessions.map((_, index) => [index, 0]))
    const sessionDependents = new Map(value.sessions.map((_, index) => [index, new Set()]))
    for (const concept of value.conceptMap) {
      const dependentSession = owners.get(concept.id)
      for (const { id } of concept.prerequisites) {
        const prerequisiteSession = owners.get(id)
        if (prerequisiteSession === dependentSession) continue
        if (!sessionDependents.get(prerequisiteSession).has(dependentSession)) {
          sessionDependents.get(prerequisiteSession).add(dependentSession)
          sessionIndegree.set(dependentSession, sessionIndegree.get(dependentSession) + 1)
        }
      }
    }
    const readySessions = [...sessionIndegree].filter(([, degree]) => degree === 0).map(([index]) => index)
    const orderedSessions = []
    while (readySessions.length) {
      readySessions.sort((a, b) => a - b)
      const index = readySessions.shift()
      orderedSessions.push(index)
      for (const dependent of sessionDependents.get(index)) {
        sessionIndegree.set(dependent, sessionIndegree.get(dependent) - 1)
        if (sessionIndegree.get(dependent) === 0) readySessions.push(dependent)
      }
    }
    if (orderedSessions.length !== value.sessions.length) throw new Error('A checkpoint combines concepts that cannot be taught in prerequisite order; split the checkpoint.')
    value.sessions = orderedSessions.map(index => value.sessions[index])
  }

  return value
}

export function mergeRevisedTeachingPlan(current, revision, completedCount) {
  const completed = current.sessions.slice(0, completedCount)
  const completedIds = new Set(completed.flatMap(session => session.conceptIds || []))
  const concepts = new Map((revision.conceptMap || []).map(concept => [concept.id, concept]))
  for (const concept of current.conceptMap || []) if (completedIds.has(concept.id)) concepts.set(concept.id, concept)

  const future = (revision.sessions || []).flatMap(session => {
    const conceptIds = (session.conceptIds || []).filter(id => !completedIds.has(id))
    return conceptIds.length ? [{ ...session, conceptIds, concepts: conceptIds.map(id => concepts.get(id)?.name).filter(Boolean) }] : []
  })

  return {
    ...revision,
    diagnostic: current.diagnostic,
    conceptMap: [...concepts.values()],
    sessions: [...completed, ...future],
  }
}
