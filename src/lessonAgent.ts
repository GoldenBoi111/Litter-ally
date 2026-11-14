import { createShapeId, toRichText, type Editor, type TLShapeId } from 'tldraw'
import { compressLegacySegments } from '@tldraw/tlschema'
import { validateTeachingBeat } from '../server/agent-actions.mjs'
import { knowledgeNodeId, readApiJson, type KnowledgeGraph, type LearningEvidence, type KnowledgeProposition, type KnowledgeReasoningChain } from './storage'
import type { LearningDiagnostic, LearningStatus } from './learning'

export type DiagramBrief = {
  title: string
  purpose: string
  kind: 'flow' | 'system' | 'comparison' | 'timeline' | 'concept-map' | 'mechanism'
}

export type LessonCheckpoint = {
  title: string
  minutes: number
  goal: string
  concepts: string[]
  conceptIds?: string[]
  activities: string[]
  narration: string
  sourcePages: number[]
  pageFocus: string
  diagrams: DiagramBrief[]
  checkForUnderstanding: string
  backgroundNotes?: string
  backgroundSources?: Array<{ title: string; url: string; relevance: string }>
}

export type TeachingPlan = {
  diagnostic?: LearningDiagnostic
  title: string
  thesis: string
  audience: string
  totalMinutes: number
  learningObjectives: string[]
  prerequisites: string[]
  conceptMap?: Array<{
    id: string
    name: string
    explanation: string
    sourcePages: number[]
    prerequisites: Array<{
      id: string
      reason: string
      evidencePages?: number[]
      relationType?: 'explicit' | 'inferred'
    }>
  }>
  sessions: LessonCheckpoint[]
  misconceptions: string[]
  finalChallenge: string
}

export type CheckpointBrief = {
  checkpoint: LessonCheckpoint
  checkpointIndex: number
  sourcePageCount: number
  concepts: NonNullable<TeachingPlan['conceptMap']>
  prerequisites: Array<{
    id: string
    name: string
    dependentName: string
    reason: string
    evidencePages: number[]
    relationType: 'explicit' | 'inferred'
    knowledgeStatus: LearningStatus | 'unknown'
    taughtAt: number
  }>
  learnerEvidence: LearningEvidence[]
  priorPropositions: KnowledgeProposition[]
  priorChains: KnowledgeReasoningChain[]
}

export function buildCheckpointBrief(plan: TeachingPlan, checkpointIndex: number, knowledge: KnowledgeGraph, evidence: LearningEvidence[] = [], sourcePageCount = Math.max(1, ...plan.sessions.flatMap(session => session.sourcePages), ...(plan.conceptMap || []).flatMap(concept => concept.sourcePages))): CheckpointBrief {
  const checkpoint = plan.sessions[checkpointIndex]
  if (!checkpoint) throw new Error('Select a lesson checkpoint before building its tutor brief.')

  const conceptById = new Map((plan.conceptMap || []).map(concept => [concept.id, concept]))
  const concepts = (checkpoint.conceptIds || []).flatMap(id => {
    const concept = conceptById.get(id)
    return concept ? [concept] : []
  })
  const prerequisites = concepts.flatMap(concept => concept.prerequisites.flatMap(link => {
    const prerequisite = conceptById.get(link.id)
    if (!prerequisite) return []
    const known = evidence
      .filter(item => item.concepts.some(result => knowledgeNodeId(result.concept) === knowledgeNodeId(prerequisite.name)))
      .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0]
      ?.concepts.find(result => knowledgeNodeId(result.concept) === knowledgeNodeId(prerequisite.name))
    return [{
      id: prerequisite.id,
      name: prerequisite.name,
      dependentName: concept.name,
      reason: link.reason,
      evidencePages: link.evidencePages || [],
      relationType: link.relationType || 'inferred' as const,
      knowledgeStatus: known?.status || 'unknown' as const,
      taughtAt: plan.sessions.findIndex(session => session.conceptIds?.includes(prerequisite.id)),
    }]
  }))

  const relevantConcepts = new Set([...concepts.map(item => item.name), ...prerequisites.map(item => item.name)].map(knowledgeNodeId))
  const learnerEvidence = evidence.filter(item => item.concepts.some(result => relevantConcepts.has(knowledgeNodeId(result.concept)))).slice(-4)
  const relatedChains = (knowledge.chains || []).filter(chain => [chain.conclusion, ...chain.premises].some(id => relevantConcepts.has(id))).slice(-12)
  const graphConcepts = new Set([...relevantConcepts, ...relatedChains.flatMap(chain => [chain.conclusion, ...chain.premises])])
  const priorPropositions = (knowledge.propositions || []).filter(item => graphConcepts.has(item.id)).slice(-20)
  const priorChains = relatedChains.slice(-12)
  return { checkpoint, checkpointIndex, sourcePageCount, concepts, prerequisites, learnerEvidence, priorPropositions, priorChains }
}

export function formatCheckpointBrief(brief: CheckpointBrief) {
  const { checkpoint, concepts, prerequisites, learnerEvidence, priorPropositions, priorChains } = brief
  const conceptLines = concepts.length
    ? concepts.map((concept, index) => `${index + 1}. ${concept.name}: ${concept.explanation} (source segments ${concept.sourcePages.join(', ')})`)
    : checkpoint.concepts.map((concept, index) => `${index + 1}. ${concept}`)
  const prerequisiteLines = prerequisites.map(link => {
    const relation = link.relationType === 'explicit' ? 'explicit in the source' : 'a suggested learning prerequisite'
    const evidence = link.evidencePages.length ? `evidence segments ${link.evidencePages.join(', ')}` : 'link-specific source evidence unavailable in this saved lesson'
    const status = link.knowledgeStatus === 'unknown' ? 'not yet assessed' : link.knowledgeStatus
    const location = link.taughtAt === brief.checkpointIndex ? 'earlier in this checkpoint' : link.taughtAt >= 0 ? 'in an earlier checkpoint' : 'not assigned to an earlier checkpoint'
    return `- ${link.name} helps explain ${link.dependentName}: ${link.reason} (${relation}; ${evidence}; learner status: ${status}; ${location}).`
  })
  const diagramLines = checkpoint.diagrams.map((diagram, index) => `${index}. ${diagram.title}: ${diagram.purpose} (${diagram.kind})`)
  const backgroundLines = (checkpoint.backgroundSources || []).map(source => `- ${source.title}: ${source.url} — ${source.relevance}`)
  const priorNames = new Map(priorPropositions.map(item => [item.id, item.concept]))
  const priorGraphLines = priorPropositions.map(item => `- ${item.concept}: ${item.statement}`)
  const priorChainLines = priorChains.map(chain => `- ${chain.premises.map(id => priorNames.get(id) || id).join(' + ')} leads to ${priorNames.get(chain.conclusion) || chain.conclusion}: ${chain.reason}`)

  return [
    `Checkpoint ${brief.checkpointIndex + 1}: ${checkpoint.title}`,
    `Goal: ${checkpoint.goal}`,
    `Teach concepts in this order:\n${conceptLines.join('\n')}`,
    prerequisiteLines.length ? `Prerequisite links:\n${prerequisiteLines.join('\n')}` : 'Prerequisite links: none for this checkpoint.',
    priorGraphLines.length ? `Ideas covered in earlier lessons:\n${priorGraphLines.join('\n')}${priorChainLines.length ? `\nRelated explanations from earlier lessons:\n${priorChainLines.join('\n')}` : ''}` : '',
    learnerEvidence.length ? `Earlier practice answers relevant to this checkpoint:\n${learnerEvidence.map(item => `- ${item.question} Answer: ${item.answer.slice(0, 900)} Feedback: ${item.feedback.slice(0, 500)}`).join('\n')}` : '',
    `Full source: ${brief.sourcePageCount} segments. You can read or open any segment from 1 to ${brief.sourcePageCount}; inspect additional relevant segments when needed, even if they are not cited in this checkpoint. Do not claim the rest is unavailable without checking.\nCited source segments: ${checkpoint.sourcePages.join(', ')}. Inspect: ${checkpoint.pageFocus}`,
    checkpoint.backgroundNotes ? `External background only (do not attribute to the supplied material): ${checkpoint.backgroundNotes}${backgroundLines.length ? `\nReputable sources: ${backgroundLines.join('\n')}` : ''}` : '',
    `Available diagrams (zero-based indexes):\n${diagramLines.length ? diagramLines.join('\n') : 'No prepared diagrams; a learner-requested visual can still be created.'}`,
    `Walkthrough: ${checkpoint.narration}`,
    `Check for understanding: ${checkpoint.checkForUnderstanding}`,
  ].join('\n')
}

type DiagramAction =
  | { _type: 'create'; id: string; shape: 'box' | 'ellipse' | 'diamond' | 'note' | 'text'; text: string; color: string }
  | { _type: 'connect'; id: string; fromId: string; toId: string; label: string; color: string }
  | Extract<TeachingAction, { _type: 'stroke' | 'text' }>

export type DiagramPlan = { actions: DiagramAction[] }
export type TeachingAction =
  | { _type: 'stroke'; id: string; atMs: number; points: Array<{ x: number; y: number }>; color: string; size: 's' | 'm' | 'l'; closed: boolean }
  | { _type: 'text'; id: string; atMs: number; x: number; y: number; text: string; color: string; size: 's' | 'm' | 'l' | 'xl' }
  | { _type: 'remove'; id: string; atMs: number; targetId: string }
export type TeachingBeat = {
  beatId: string
  context: string
  speech: string
  pauseMs: number
  waitForLearner: boolean
  placement: 'new-section' | 'continue' | 'revisit'
  anchorBeatId: string
  actions: TeachingAction[]
}
export type TeachingExecutionState = {
  beatId: string
  actions: Array<{ id: string; state: 'interrupted' | 'complete'; progress: number }>
}

export function readTeachingBeat(value: unknown) {
  return validateTeachingBeat(value) as TeachingBeat
}
export type SelectionContext = {
  mode: 'selection' | 'recent-user-mark'
  bounds: { x: number; y: number; w: number; h: number }
  shapes: Array<{ id: string; type: string; text: string; owner: string; bounds: { x: number; y: number; w: number; h: number } }>
}

const ACTION_DELAY_MS = 180

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Lesson paused.', 'AbortError')); return }
    const onAbort = () => {
      globalThis.clearTimeout(timeout)
      reject(new DOMException('Lesson paused.', 'AbortError'))
    }
    const timeout = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

type AgentCursorPoint = { x: number; y: number }
type AgentCursor = (point: AgentCursorPoint) => void

async function guideCursor(cursor: AgentCursor | undefined, from: AgentCursorPoint | null, to: AgentCursorPoint, signal: AbortSignal) {
  if (!cursor) return
  const steps = from ? 8 : 1
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps
    cursor(from ? { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress } : to)
    await wait(14, signal)
  }
}

export async function requestDiagramPlan(input: {
  title: string
  checkpoint: LessonCheckpoint
  diagram: DiagramBrief
  signal: AbortSignal
}): Promise<DiagramPlan> {
  return readApiJson<DiagramPlan>(fetch('/api/diagram', {
    method: 'POST',
    signal: input.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: input.title, checkpoint: input.checkpoint, diagram: input.diagram }),
  }), 'The diagram service')
}

export async function applyDiagramPlan(editor: Editor, plan: DiagramPlan, context: {
  lessonId: string
  checkpointIndex: number
  diagramIndex: number
  diagramKind: DiagramBrief['kind']
  signal: AbortSignal
  onAction?: (message: string) => void
  onCursor?: AgentCursor
}) {
  const diagramId = `${context.checkpointIndex}-${context.diagramIndex}`
  const existing = editor.getCurrentPageShapes()
    .filter(shape => shape.meta?.owner === 'agent' && shape.meta?.lessonId === context.lessonId && shape.meta?.diagramId === diagramId)
  const generationCount = new Set(existing.map(shape => shape.meta?.generationId || 'legacy')).size
  const xOffset = context.checkpointIndex * 2800 + 950 + generationCount * 1250
  const yOffset = 220 + context.diagramIndex * 760

  if (plan.actions.some(action => action._type === 'stroke' || action._type === 'text')) {
    const interruptedShape = existing.find(shape => shape.meta?.actionState === 'interrupted')
    const interruptedGeneration = interruptedShape?.meta?.generationId
    const generationId = typeof interruptedGeneration === 'string' ? interruptedGeneration : crypto.randomUUID()
    const beatId = `diagram_${diagramId.replaceAll('-', '_')}_${generationId.replaceAll('-', '_')}`
    return applyTeachingBeat(editor, {
      beatId, context: 'Drawing a visual explanation.', speech: 'Drawing a visual explanation.', pauseMs: 0, waitForLearner: false,
      placement: 'continue', anchorBeatId: '', actions: plan.actions as TeachingAction[],
    }, {
      lessonId: context.lessonId, checkpointIndex: context.checkpointIndex, signal: context.signal, onAction: context.onAction, onCursor: context.onCursor,
      diagramId, generationId, origin: interruptedShape && typeof interruptedShape.meta?.originX === 'number' && typeof interruptedShape.meta?.originY === 'number'
        ? { x: interruptedShape.meta.originX, y: interruptedShape.meta.originY } : { x: xOffset, y: yOffset },
    })
  }

  const nodes = plan.actions.filter((action): action is Extract<DiagramAction, { _type: 'create' }> => action._type === 'create')
  const columns = context.diagramKind === 'comparison' ? 2 : ['flow', 'timeline'].includes(context.diagramKind) ? Math.min(4, nodes.length) : Math.min(3, Math.ceil(Math.sqrt(nodes.length)))
  const created = new Map<string, { id: TLShapeId; point: AgentCursorPoint }>()
  const createdIds: TLShapeId[] = []
  let cursorPoint: AgentCursorPoint | null = null
  const generationId = crypto.randomUUID()
  const meta = { owner: 'agent', lessonId: context.lessonId, checkpointId: String(context.checkpointIndex), diagramId, generationId }

  let nodeIndex = 0
  for (const action of plan.actions) {
    if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
    const id = createShapeId(`lesson-${context.lessonId}-${diagramId}-${generationId}-${action.id}`)
    if (action._type === 'create') {
      const row = Math.floor(nodeIndex / columns)
      const offsetColumn = nodeIndex % columns
      const column = ['flow', 'timeline'].includes(context.diagramKind) && row % 2 ? columns - 1 - offsetColumn : offsetColumn
      const x = xOffset + column * 300 + 40
      const y = yOffset + row * 200 + 40
      const point = { x: x + 110, y: y + 60 }
      await guideCursor(context.onCursor, cursorPoint, point, context.signal)
      cursorPoint = point
      nodeIndex += 1
      const geo = action.shape === 'ellipse' ? 'ellipse' : action.shape === 'diamond' ? 'diamond' : 'rectangle'
      editor.createShape({
        id, type: 'geo', x, y, meta,
        props: {
          geo, w: 220, h: 120, color: action.color,
          fill: action.shape === 'text' ? 'none' : action.shape === 'note' ? 'solid' : 'semi',
          richText: toRichText(action.text), font: 'sans', align: 'middle', verticalAlign: 'middle',
        },
      } as any)
      created.set(action.id, { id, point })
      createdIds.push(id)
      context.onAction?.(`Drew ${action.text || action.shape}`)
    } else if (action._type === 'connect') {
      const from = created.get(action.fromId)
      const to = created.get(action.toId)
      if (!from || !to) continue
      await guideCursor(context.onCursor, cursorPoint, from.point, context.signal)
      cursorPoint = from.point
      await guideCursor(context.onCursor, cursorPoint, to.point, context.signal)
      cursorPoint = to.point
      editor.createShape({
        id, type: 'arrow', x: 0, y: 0, meta,
        props: { kind: 'elbow', start: { x: 0, y: 0 }, end: { x: 80, y: 80 }, color: action.color, richText: toRichText(action.label), arrowheadEnd: 'arrow' },
      } as any)
      for (const [terminal, target] of [['start', from.id], ['end', to.id]] as const) {
        editor.createBinding({
          type: 'arrow', fromId: id, toId: target,
          props: { terminal, isExact: false, isPrecise: false, normalizedAnchor: { x: 0.5, y: 0.5 }, snap: 'none' },
        })
      }
      createdIds.push(id)
      context.onAction?.(`Connected ${action.fromId} to ${action.toId}`)
    }
    await wait(ACTION_DELAY_MS, context.signal)
  }

  if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
  const bounds = editor.getShapesPageBounds(createdIds)
  if (bounds) editor.zoomToBounds(bounds, { animation: { duration: 350 }, inset: 72 })
  return createdIds
}

function beatOrigin(editor: Editor, beat: TeachingBeat, lessonId: string, checkpointIndex: number) {
  const shapes = editor.getCurrentPageShapes().filter(shape => shape.meta?.owner === 'agent' && shape.meta?.lessonId === lessonId && shape.meta?.checkpointId === String(checkpointIndex))
  const sameBeat = shapes.find(shape => shape.meta?.beatId === beat.beatId)
  if (sameBeat && typeof sameBeat.meta?.originX === 'number' && typeof sameBeat.meta?.originY === 'number') return { x: sameBeat.meta.originX, y: sameBeat.meta.originY }
  const anchor = beat.placement === 'revisit' && beat.anchorBeatId ? shapes.find(shape => shape.meta?.beatId === beat.anchorBeatId) : undefined
  if (anchor && typeof anchor.meta?.originX === 'number' && typeof anchor.meta?.originY === 'number') return { x: anchor.meta.originX, y: anchor.meta.originY }
  const beatIds = [...new Set(shapes.map(shape => shape.meta?.beatId).filter((id): id is string => typeof id === 'string'))]
  const index = beatIds.length
  return { x: checkpointIndex * 2800 + 2000, y: 220 + index * 760 }
}

function smoothStrokePoints(points: Array<{ x: number; y: number }>, closed: boolean) {
  if (points.length < 3) return points
  const result = [points[0]]
  const segments = closed ? points.length : points.length - 1
  for (let index = 0; index < segments; index++) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const before = closed ? points[(index - 1 + points.length) % points.length] : index ? points[index - 1] : { x: 2 * start.x - end.x, y: 2 * start.y - end.y }
    const after = closed ? points[(index + 2) % points.length] : index + 2 < points.length ? points[index + 2] : { x: 2 * end.x - start.x, y: 2 * end.y - start.y }
    for (let step = 1; step <= 3; step++) {
      if (closed && index === segments - 1 && step === 3) continue
      const t = step / 3
      const t2 = t * t
      const t3 = t2 * t
      result.push({
        x: 0.5 * ((2 * start.x) + (-before.x + end.x) * t + (2 * before.x - 5 * start.x + 4 * end.x - after.x) * t2 + (-before.x + 3 * start.x - 3 * end.x + after.x) * t3),
        y: 0.5 * ((2 * start.y) + (-before.y + end.y) * t + (2 * before.y - 5 * start.y + 4 * end.y - after.y) * t2 + (-before.y + 3 * start.y - 3 * end.y + after.y) * t3),
      })
    }
  }
  return result
}

export async function applyTeachingBeat(editor: Editor, input: TeachingBeat, context: {
  lessonId: string
  checkpointIndex: number
  signal: AbortSignal
  onAction?: (message: string) => void
  onCursor?: AgentCursor
  diagramId?: string
  generationId?: string
  origin?: { x: number; y: number }
}): Promise<TeachingExecutionState> {
  const beat = readTeachingBeat(input)
  const origin = context.origin || beatOrigin(editor, beat, context.lessonId, context.checkpointIndex)
  const startedAt = performance.now()
  const completedIds: TLShapeId[] = []
  let cursorPoint: AgentCursorPoint | null = null
  const metaFor = (action: TeachingAction, state: 'interrupted' | 'complete', progress: number) => ({
    owner: 'agent', lessonId: context.lessonId, checkpointId: String(context.checkpointIndex), beatId: beat.beatId,
    actionId: action.id, actionState: state, actionProgress: progress, originX: origin.x, originY: origin.y,
    ...(context.diagramId ? { diagramId: context.diagramId } : {}), ...(context.generationId ? { generationId: context.generationId } : {}),
  })

  for (const action of beat.actions) {
    const remainingCue = action.atMs - (performance.now() - startedAt)
    if (remainingCue > 0) await wait(remainingCue, context.signal)
    if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
    if (action._type === 'remove') {
      const targets = editor.getCurrentPageShapes().filter(shape => shape.meta?.owner === 'agent' && shape.meta?.lessonId === context.lessonId && shape.meta?.actionId === action.targetId)
      const targetBounds = editor.getShapesPageBounds(targets.map(shape => shape.id))
      if (targetBounds) {
        const target = { x: targetBounds.midX, y: targetBounds.midY }
        await guideCursor(context.onCursor, cursorPoint, target, context.signal)
        cursorPoint = target
      }
      if (targets.length) editor.deleteShapes(targets.map(shape => shape.id))
      context.onAction?.(`Revised ${action.targetId}`)
      continue
    }

    const id = createShapeId(`lesson-${context.lessonId}-${context.checkpointIndex}-${beat.beatId}-${action.id}`)
    const existing = editor.getShape(id)
    if (existing?.meta?.actionState === 'complete') { completedIds.push(id); continue }

    if (action._type === 'stroke') {
      let progress = Math.max(0, Math.min(action.points.length, Number(existing?.meta?.actionProgress) || 0))
      if (action.points.length) {
        const start = action.points[Math.max(0, progress - 1)]
        const next = { x: origin.x + start.x, y: origin.y + start.y }
        await guideCursor(context.onCursor, cursorPoint, next, context.signal)
        cursorPoint = next
      }
      const strokePoints = () => smoothStrokePoints(action.points.slice(0, progress), action.closed && progress === action.points.length).map(point => ({ ...point, z: 0.5 }))
      if (!existing) {
        progress = Math.min(2, action.points.length)
        editor.createShape({
          id, type: 'draw', x: origin.x, y: origin.y, meta: metaFor(action, 'interrupted', progress),
          props: { color: action.color, fill: 'none', dash: 'draw', size: action.size, segments: compressLegacySegments([{ type: 'free', points: strokePoints() }]), isComplete: false, isClosed: action.closed, isPen: true, scale: 1, scaleX: 1, scaleY: 1 },
        } as any)
      }
      try {
        while (progress < action.points.length) {
          if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
          progress = Math.min(action.points.length, progress + 1)
          const point = action.points[progress - 1]
          cursorPoint = { x: origin.x + point.x, y: origin.y + point.y }
          context.onCursor?.(cursorPoint)
          editor.updateShape({ id, type: 'draw', meta: metaFor(action, progress === action.points.length ? 'complete' : 'interrupted', progress), props: { segments: compressLegacySegments([{ type: 'free', points: strokePoints() }]), isComplete: progress === action.points.length } } as any)
          await wait(16, context.signal)
        }
      } catch (error) {
        editor.updateShape({ id, type: 'draw', meta: metaFor(action, 'interrupted', progress) } as any)
        throw error
      }
      context.onAction?.(`Inked ${action.id}`)
    } else {
      let progress = Math.max(0, Math.min(action.text.length, Number(existing?.meta?.actionProgress) || 0))
      const textPoint = { x: origin.x + action.x, y: origin.y + action.y }
      await guideCursor(context.onCursor, cursorPoint, { x: textPoint.x + Math.min(progress * 3, 420), y: textPoint.y }, context.signal)
      cursorPoint = { x: textPoint.x + Math.min(progress * 3, 420), y: textPoint.y }
      if (!existing) {
        editor.createShape({ id, type: 'text', x: origin.x + action.x, y: origin.y + action.y, meta: metaFor(action, 'interrupted', 0), props: { richText: toRichText(''), color: action.color, size: action.size, font: 'draw', autoSize: true } } as any)
      }
      try {
        while (progress < action.text.length) {
          if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
          progress = Math.min(action.text.length, progress + 3)
          cursorPoint = { x: textPoint.x + Math.min(progress * 3, 420), y: textPoint.y }
          context.onCursor?.(cursorPoint)
          editor.updateShape({ id, type: 'text', meta: metaFor(action, progress === action.text.length ? 'complete' : 'interrupted', progress), props: { richText: toRichText(action.text.slice(0, progress)) } } as any)
          await wait(22, context.signal)
        }
      } catch (error) {
        editor.updateShape({ id, type: 'text', meta: metaFor(action, 'interrupted', progress) } as any)
        throw error
      }
      context.onAction?.(`Wrote ${action.text}`)
    }
    completedIds.push(id)
  }

  const bounds = editor.getShapesPageBounds(completedIds)
  if (bounds) editor.zoomToBounds(bounds, { animation: { duration: 250 }, inset: 96 })
  return getTeachingExecutionState(editor, context.lessonId, beat.beatId)
}

export function getTeachingExecutionState(editor: Editor, lessonId: string, beatId: string): TeachingExecutionState {
  const actions = editor.getCurrentPageShapes().filter(shape => shape.meta?.owner === 'agent' && shape.meta?.lessonId === lessonId && shape.meta?.beatId === beatId).map(shape => ({
    id: String(shape.meta?.actionId || shape.id),
    state: shape.meta?.actionState === 'complete' ? 'complete' as const : 'interrupted' as const,
    progress: Number(shape.meta?.actionProgress) || 0,
  }))
  return { beatId, actions }
}

export function getSelectionContext(editor: Editor): SelectionContext | null {
  const selectedBounds = editor.getSelectionPageBounds()
  const recentMark = !selectedBounds ? [...editor.getCurrentPageShapes()].reverse().find(shape => !shape.meta?.owner && ['draw', 'arrow', 'highlight'].includes(shape.type)) : undefined
  const bounds = selectedBounds || (recentMark ? editor.getShapePageBounds(recentMark) : null)
  if (!bounds) return null
  const shapes = editor.getCurrentPageShapes().filter(shape => {
    const shapeBounds = editor.getShapePageBounds(shape)
    return shapeBounds && shapeBounds.x < bounds.x + bounds.w && shapeBounds.x + shapeBounds.w > bounds.x &&
      shapeBounds.y < bounds.y + bounds.h && shapeBounds.y + shapeBounds.h > bounds.y
  }).map(shape => ({
    id: shape.id,
    type: shape.type,
    text: editor.getShapeUtil(shape).getText(shape as any) || '',
    owner: typeof shape.meta?.owner === 'string' ? shape.meta.owner : 'user',
    bounds: (() => { const item = editor.getShapePageBounds(shape); return item ? { x: item.x, y: item.y, w: item.w, h: item.h } : { x: 0, y: 0, w: 0, h: 0 } })(),
  }))
  return { mode: selectedBounds ? 'selection' : 'recent-user-mark', bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }, shapes }
}
