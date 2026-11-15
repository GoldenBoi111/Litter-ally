import { createShapeId, toRichText, type Editor, type TLShapeId } from 'tldraw'
import { compressLegacySegments } from '@tldraw/tlschema'
import { validateTeachingBeat } from '../server/agent-actions.mjs'
import { knowledgeNodeId, readApiJson, type KnowledgeGraph, type LearningEvidence, type KnowledgeProposition, type KnowledgeReasoningChain } from './storage'
import type { LearningDiagnostic, LearningStatus } from './learning'
import { getWidgetSize, type WidgetData } from './lessonWidgets'
import { clearVerticalOverlap } from './lessonPlacement'

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
  | { _type: 'arrow'; id: string; atMs: number; from: { x: number; y: number }; to: { x: number; y: number }; label: string; color: string; bend: number; both: boolean }
  | { _type: 'remove'; id: string; atMs: number; targetId: string }
  | { _type: 'move'; id: string; atMs: number; targetId: string; dx: number; dy: number }
  | ({ _type: 'widget'; id: string; atMs: number; x: number; y: number; w: number; h: number } & WidgetData)
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

const ACTION_DELAY_MS = 90
/** Handwriting pace while the tutor speaks. */
export const BEAT_PACE = 1.6
/** Local coordinate space the model draws in for each beat (matches the server prompt). */
const DRAWING_AREA = { w: 1200, h: 700 }
/** Each concept gets its own 2400-pixel column: source material on the left, the tutor's region beside it. */
const CONCEPT_COLUMN = 2400
const TUTOR_COLUMN_OFFSET = 1100
const CONCEPT_TOP = 220
/** Clear space kept around a concept's drawing region, so a finished concept never bleeds into the next one. */
const REGION_MARGIN = 48
/** Rough speaking rate of the tutor voice, used to spread a beat's ink across its narration. */
const SPOKEN_MS_PER_WORD = 330
export const DIAGRAM_PACE = 1.8

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
  const boardStart = conceptRegion(editor, context.lessonId, context.checkpointIndex)

  if (plan.actions.some(action => action._type === 'stroke' || action._type === 'text')) {
    const interruptedShape = existing.find(shape => shape.meta?.actionState === 'interrupted')
    const interruptedGeneration = interruptedShape?.meta?.generationId
    const generationId = typeof interruptedGeneration === 'string' ? interruptedGeneration : crypto.randomUUID()
    const origin = interruptedShape && typeof interruptedShape.meta?.originX === 'number' && typeof interruptedShape.meta?.originY === 'number'
      ? { x: interruptedShape.meta.originX, y: interruptedShape.meta.originY }
      : clearBeatOrigin(editor, { actions: plan.actions.filter((action): action is Extract<TeachingAction, { _type: 'stroke' | 'text' }> => action._type === 'stroke' || action._type === 'text') }, boardStart, true)
    for (let start = 0; start < plan.actions.length; start += 12) {
      await applyTeachingBeat(editor, {
        beatId: `diagram_${diagramId.replaceAll('-', '_')}_${generationId.replaceAll('-', '')}_${start}`,
        context: 'Drawing a visual explanation.', speech: 'Drawing a visual explanation.', pauseMs: 0, waitForLearner: false,
        placement: 'continue', anchorBeatId: '', actions: plan.actions.slice(start, start + 12) as TeachingAction[],
      }, {
        lessonId: context.lessonId, checkpointIndex: context.checkpointIndex, signal: context.signal, onAction: context.onAction, onCursor: context.onCursor,
        diagramId, generationId, origin, pace: DIAGRAM_PACE,
      })
    }
    return
  }

  const nodes = plan.actions.filter((action): action is Extract<DiagramAction, { _type: 'create' }> => action._type === 'create')
  const columns = context.diagramKind === 'comparison' ? 2 : ['flow', 'timeline'].includes(context.diagramKind) ? Math.min(4, nodes.length) : Math.min(3, Math.ceil(Math.sqrt(nodes.length)))
  const cell = { w: 900, h: 600 }
  const { x: xOffset, y: yOffset } = clearBeatOrigin(editor, {
    actions: [{ _type: 'stroke', id: 'area', atMs: 0, points: [{ x: 0, y: 0 }, { x: columns * cell.w, y: Math.ceil(nodes.length / columns) * cell.h }], color: 'black', size: 'm', closed: false }],
  }, boardStart, true)
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
      const x = xOffset + column * cell.w + 120
      const y = yOffset + row * cell.h + 120
      const point = { x: x + 330, y: y + 180 }
      editor.centerOnPoint(point, { animation: { duration: 220 } })
      await guideCursor(context.onCursor, cursorPoint, point, context.signal)
      cursorPoint = point
      nodeIndex += 1
      const geo = action.shape === 'ellipse' ? 'ellipse' : action.shape === 'diamond' ? 'diamond' : 'rectangle'
      editor.createShape({
        id, type: 'geo', x, y, meta,
        props: {
          geo, w: 220, h: 120, scale: 3, color: action.color,
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
      const dx = to.point.x - from.point.x
      const dy = to.point.y - from.point.y
      const horizontal = Math.abs(dx) >= Math.abs(dy)
      const fromAnchor = horizontal ? { x: dx >= 0 ? 1 : 0, y: 0.5 } : { x: 0.5, y: dy >= 0 ? 1 : 0 }
      const toAnchor = horizontal ? { x: dx >= 0 ? 0 : 1, y: 0.5 } : { x: 0.5, y: dy >= 0 ? 0 : 1 }
      editor.centerOnPoint(from.point, { animation: { duration: 220 } })
      await guideCursor(context.onCursor, cursorPoint, from.point, context.signal)
      cursorPoint = from.point
      await guideCursor(context.onCursor, cursorPoint, to.point, context.signal)
      cursorPoint = to.point
      editor.createShape({
        id, type: 'arrow', x: from.point.x, y: from.point.y, meta,
        props: { kind: 'elbow', start: { x: 0, y: 0 }, end: { x: to.point.x - from.point.x, y: to.point.y - from.point.y }, color: action.color, size: 'm', scale: 1, richText: toRichText(action.label), arrowheadEnd: 'arrow' },
      } as any)
      for (const [terminal, target, normalizedAnchor] of [['start', from.id, fromAnchor], ['end', to.id, toAnchor]] as const) {
        editor.createBinding({
          type: 'arrow', fromId: id, toId: target,
          props: { terminal, isExact: false, isPrecise: false, normalizedAnchor, snap: 'none' },
        })
      }
      createdIds.push(id)
      context.onAction?.(`Connected ${action.fromId} to ${action.toId}`)
    }
    await wait(ACTION_DELAY_MS * DIAGRAM_PACE * 2, context.signal)
  }

  if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
  const bounds = editor.getShapesPageBounds(createdIds)
  if (bounds) editor.zoomToBounds(bounds, { animation: { duration: 350 }, inset: 72, targetZoom: 0.8 })
  return createdIds
}

function beatMarkBounds(beat: Pick<TeachingBeat, 'actions'>) {
  return beat.actions.flatMap(action => {
    if (action._type === 'stroke') {
      const xs = action.points.map(point => point.x), ys = action.points.map(point => point.y)
      return [{ type: 'stroke', x: Math.min(...xs) - 12, y: Math.min(...ys) - 12, w: Math.max(...xs) - Math.min(...xs) + 24, h: Math.max(...ys) - Math.min(...ys) + 24 }]
    }
    if (action._type === 'text') {
      const lines = action.text.split('\n'), font = { l: 36, xl: 48 }[action.size === 's' || action.size === 'm' ? 'l' : action.size] * 3
      return [{ type: 'text', x: action.x - 8, y: action.y - 8, w: Math.max(...lines.map(line => line.length)) * font * 0.8 + 16, h: lines.length * font * 1.35 + 16 }]
    }
    if (action._type === 'arrow') {
      const x = Math.min(action.from.x, action.to.x), y = Math.min(action.from.y, action.to.y)
      const bend = Math.abs(action.bend)
      return [{ type: 'stroke', x: x - 12 - bend, y: y - 12 - bend, w: Math.abs(action.to.x - action.from.x) + 24 + bend * 2, h: Math.abs(action.to.y - action.from.y) + 24 + bend * 2 }]
    }
    if (action._type === 'widget') {
      const { w, h } = getWidgetSize(action, action.w, action.h)
      return [{ type: 'widget', x: action.x, y: action.y, w, h }]
    }
    return []
  })
}

function clearShapeOverlaps(editor: Editor, id: TLShapeId) {
  const shape = editor.getShape(id)
  const bounds = shape && editor.getShapePageBounds(shape)
  if (!shape || !bounds) return
  const occupied = editor.getCurrentPageShapes().filter(other => other.id !== id).flatMap(other => {
    const box = editor.getShapePageBounds(other)
    return box ? [box] : []
  })
  const y = clearVerticalOverlap(bounds, occupied)
  if (y !== bounds.y) editor.updateShape({ id, type: shape.type, y: shape.y + y - bounds.y } as any)
}

function clearBeatOrigin(editor: Editor, beat: Pick<TeachingBeat, 'actions'>, start: { x: number; y: number }, avoidAgent: boolean) {
  const marks = beatMarkBounds(beat)
  if (!marks.length) return start
  const occupied = editor.getCurrentPageShapes().flatMap(shape => {
    const bounds = editor.getShapePageBounds(shape)
    const containsText = shape.type === 'text' || Boolean(editor.getShapeUtil(shape).getText(shape as any)?.trim())
    return bounds ? [{ shape, bounds, containsText }] : []
  })
  let origin = { ...start }
  for (let attempt = 0; attempt < occupied.length + 1; attempt++) {
    let nextY = origin.y
    for (const mark of marks) for (const { shape, bounds, containsText } of occupied) {
      if (!avoidAgent && shape.meta?.owner === 'agent' && !containsText && mark.type !== 'text') continue
      if (origin.x + mark.x < bounds.x + bounds.w + 24 && origin.x + mark.x + mark.w > bounds.x - 24 &&
          origin.y + mark.y < bounds.y + bounds.h + 24 && origin.y + mark.y + mark.h > bounds.y - 24) {
        nextY = Math.max(nextY, bounds.y + bounds.h + 48 - mark.y)
      }
    }
    if (nextY === origin.y) return origin
    origin = { ...origin, y: nextY }
  }
  return origin
}

/** Every mark the tutor made for one concept: ink, lettering, widgets, diagrams and the material it brought in. */
export function conceptMarks(editor: Editor, lessonId: string, checkpointIndex: number) {
  return editor.getCurrentPageShapes().filter(shape =>
    (shape.meta?.owner === 'agent' || shape.meta?.owner === 'source') &&
    shape.meta?.checkpointId === String(checkpointIndex) &&
    (shape.meta?.owner !== 'agent' || shape.meta?.lessonId === lessonId))
}

/** Restarting a concept wipes everything the tutor put up for it; the learner's own marks are never touched. */
export function clearConceptMarks(editor: Editor, lessonId: string, checkpointIndex: number) {
  const marks = conceptMarks(editor, lessonId, checkpointIndex)
  if (marks.length) editor.deleteShapes(marks.map(shape => shape.id))
  return marks.length
}

/** True when a whole drawing region, plus its margin, holds nothing already. */
function regionIsClear(editor: Editor, origin: { x: number; y: number }, keep: Set<string>) {
  const area = {
    minX: origin.x - REGION_MARGIN, minY: origin.y - REGION_MARGIN,
    maxX: origin.x + DRAWING_AREA.w + REGION_MARGIN, maxY: origin.y + DRAWING_AREA.h + REGION_MARGIN,
  }
  return !editor.getCurrentPageShapes().some(shape => {
    if (keep.has(shape.id)) return false
    const bounds = editor.getShapePageBounds(shape)
    return !!bounds && bounds.x < area.maxX && bounds.x + bounds.w > area.minX && bounds.y < area.maxY && bounds.y + bounds.h > area.minY
  })
}

/**
 * The clear patch of board a concept works in: the region it already started, or — for a concept with nothing
 * on the board yet — a free region in its own column, stepping down and then across until nothing is in the way.
 */
export function conceptRegion(editor: Editor, lessonId: string, checkpointIndex: number) {
  const started = conceptMarks(editor, lessonId, checkpointIndex)
    .filter(shape => typeof shape.meta?.originX === 'number' && typeof shape.meta?.originY === 'number')
  if (started.length) return {
    x: Math.min(...started.map(shape => shape.meta.originX as number)),
    y: Math.min(...started.map(shape => shape.meta.originY as number)),
  }
  const keep = new Set(conceptMarks(editor, lessonId, checkpointIndex).map(shape => shape.id))
  const stepY = DRAWING_AREA.h + REGION_MARGIN * 2
  for (let column = 0; column < 64; column++) {
    for (let row = 0; row < 8; row++) {
      const origin = { x: checkpointIndex * CONCEPT_COLUMN + TUTOR_COLUMN_OFFSET + column * CONCEPT_COLUMN, y: CONCEPT_TOP + row * stepY }
      if (regionIsClear(editor, origin, keep)) return origin
    }
  }
  // A board this full still gets a fresh start: below everything on it.
  const bottoms = editor.getCurrentPageShapes().flatMap(shape => {
    const bounds = editor.getShapePageBounds(shape)
    return bounds ? [bounds.y + bounds.h] : []
  })
  return { x: checkpointIndex * CONCEPT_COLUMN + TUTOR_COLUMN_OFFSET, y: bottoms.length ? Math.max(...bottoms) + REGION_MARGIN * 2 : CONCEPT_TOP }
}

/** Bring a concept's region into view, so a restarted or freshly opened concept starts on visibly blank board. */
export function focusConceptRegion(editor: Editor, lessonId: string, checkpointIndex: number) {
  const origin = conceptRegion(editor, lessonId, checkpointIndex)
  editor.zoomToBounds({ x: origin.x, y: origin.y, w: DRAWING_AREA.w, h: DRAWING_AREA.h }, { animation: { duration: 350 }, inset: 48, targetZoom: 0.8 })
  return origin
}

/** A drawing area is full once the marks already in it reach the bottom of its 1200 x 700 space. */
function areaIsFull(editor: Editor, shapes: ReturnType<Editor['getCurrentPageShapes']>, origin: { x: number; y: number }) {
  const used = shapes.filter(shape => shape.meta?.originX === origin.x && shape.meta?.originY === origin.y).flatMap(shape => {
    const bounds = editor.getShapePageBounds(shape)
    return bounds ? [bounds.y + bounds.h - origin.y] : []
  })
  return used.length > 0 && Math.max(...used) > DRAWING_AREA.h
}

function beatOrigin(editor: Editor, beat: TeachingBeat, lessonId: string, checkpointIndex: number) {
  const shapes = editor.getCurrentPageShapes().filter(shape => shape.meta?.owner === 'agent' && shape.meta?.lessonId === lessonId && shape.meta?.checkpointId === String(checkpointIndex))
  const sameBeat = shapes.find(shape => shape.meta?.beatId === beat.beatId)
  if (sameBeat && typeof sameBeat.meta?.originX === 'number' && typeof sameBeat.meta?.originY === 'number') return { x: sameBeat.meta.originX, y: sameBeat.meta.originY }
  const anchor = beat.placement === 'revisit' && beat.anchorBeatId ? shapes.find(shape => shape.meta?.beatId === beat.anchorBeatId) : undefined
  if (anchor && typeof anchor.meta?.originX === 'number' && typeof anchor.meta?.originY === 'number') return clearBeatOrigin(editor, beat, { x: anchor.meta.originX, y: anchor.meta.originY }, false)
  // "continue" keeps drawing in the latest area, so consecutive beats build one picture in shared coordinates —
  // until that area is full, when the tutor has to move on rather than keep piling ink into the same patch.
  if (beat.placement === 'continue') {
    const latest = [...shapes].reverse().find(shape => typeof shape.meta?.originX === 'number' && typeof shape.meta?.originY === 'number')
    const origin = latest ? { x: latest.meta.originX as number, y: latest.meta.originY as number } : null
    if (origin && !areaIsFull(editor, shapes, origin)) return clearBeatOrigin(editor, beat, origin, true)
  }
  // A new idea in a concept already under way stacks below that concept's work; a concept with nothing on the
  // board yet starts in a region that is clear of every other mark, so finished concepts are never drawn over.
  const region = conceptRegion(editor, lessonId, checkpointIndex)
  const prior = shapes.filter(shape => !shape.meta?.diagramId).flatMap(shape => { const bounds = editor.getShapePageBounds(shape); return bounds ? [bounds.y + bounds.h] : [] })
  const top = Math.min(0, ...beatMarkBounds(beat).map(mark => mark.y))
  return clearBeatOrigin(editor, beat, { x: region.x, y: prior.length ? Math.max(...prior) + 60 - top : region.y }, true)
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
  /** Multiplier on stroke and lettering delays; defaults to BEAT_PACE. */
  pace?: number
}): Promise<TeachingExecutionState> {
  const pace = context.pace ?? BEAT_PACE
  const beat = readTeachingBeat(input)
  const origin = context.origin || beatOrigin(editor, beat, context.lessonId, context.checkpointIndex)
  const textBoxes = new Map<string, { x: number; y: number; w: number; h: number }>()
  const textPlanned = new Map<string, { x: number; y: number; w: number; h: number }>()
  const ownActionIds = new Set(beat.actions.map(action => String(createShapeId(`lesson-${context.lessonId}-${context.checkpointIndex}-${beat.beatId}-${action.id}`))))
  const occupiedTextLayout = editor.getCurrentPageShapes().filter(shape => !ownActionIds.has(shape.id)).flatMap(shape => {
    const bounds = editor.getShapePageBounds(shape)
    return bounds ? [{ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }] : []
  })
  for (const action of context.diagramId ? [] : beat.actions) {
    if (action._type !== 'text') continue
    const mark = beatMarkBounds({ actions: [action] })[0]
    const shapeId = createShapeId(`lesson-${context.lessonId}-${context.checkpointIndex}-${beat.beatId}-${action.id}`)
    const existing = editor.getShape(shapeId)
    const bounds = existing && editor.getShapePageBounds(existing)
    const box = bounds ?? { x: origin.x + mark.x, y: origin.y + mark.y, w: mark.w, h: mark.h }
    if (!existing) box.y = clearVerticalOverlap(box, occupiedTextLayout)
    textPlanned.set(action.id, box)
    textBoxes.set(action.id, box)
    occupiedTextLayout.push(box)
  }
  const startedAt = performance.now()
  const completedIds: TLShapeId[] = []
  let cursorPoint: AgentCursorPoint | null = null
  let previousTextId: TLShapeId | null = null
  let previousTextPlanned: AgentCursorPoint | null = null
  const renderedTextEnd = (shapeId: TLShapeId, fallback: AgentCursorPoint) => {
    const text = editor.getContainer().querySelector<HTMLElement>(`[data-shape-id="${shapeId}"] .tl-rich-text`)
    if (text?.textContent) {
      const range = text.ownerDocument.createRange()
      range.selectNodeContents(text)
      range.collapse(false)
      const rect = range.getBoundingClientRect()
      if (rect.height) return editor.screenToPage({ x: rect.right, y: rect.top + rect.height / 2 })
    }
    const shape = editor.getShape(shapeId)
    const bounds = shape && editor.getShapePageBounds(shape)
    return bounds ? { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 } : fallback
  }
  const relocatedTextPoint = (point: AgentCursorPoint) => {
    let closest = Infinity
    let result = point
    for (const entry of [...beat.actions].reverse()) {
      if (entry._type !== 'text') continue
      const shape = editor.getShape(createShapeId(`lesson-${context.lessonId}-${context.checkpointIndex}-${beat.beatId}-${entry.id}`))
      const reserved = textPlanned.get(entry.id)
      if (!reserved) continue
      const planned = { x: reserved.x + 8, y: reserved.y + 8, w: reserved.w, h: reserved.h }
      const bounds = shape && editor.getShapePageBounds(shape)
      const actual = bounds ?? planned
      const distance = Math.min(Math.abs(point.x - planned.x), Math.abs(point.x - planned.x - planned.w))
      if (distance > 48 || point.y < planned.y - 48 || point.y > planned.y + planned.h + 48 || distance >= closest) continue
      closest = distance
      result = { x: point.x + actual.x - planned.x, y: point.y + actual.y - planned.y }
    }
    return result
  }
  const metaFor = (action: TeachingAction, state: 'interrupted' | 'complete', progress: number) => ({
    owner: 'agent', lessonId: context.lessonId, checkpointId: String(context.checkpointIndex), beatId: beat.beatId,
    actionId: action.id, actionState: state, actionProgress: progress, originX: origin.x, originY: origin.y,
    ...(context.diagramId ? { diagramId: context.diagramId } : {}), ...(context.generationId ? { generationId: context.generationId } : {}),
  })

  // Bring the drawing area into view before the pen starts, so the learner watches the ink appear while the tutor speaks.
  if (beat.actions.some(action => action._type === 'stroke' || action._type === 'text' || action._type === 'arrow' || action._type === 'widget')) {
    const area = { x: origin.x, y: origin.y, w: DRAWING_AREA.w, h: DRAWING_AREA.h }
    const view = editor.getViewportPageBounds()
    const visible = area.x >= view.minX && area.y >= view.minY && area.x + area.w <= view.maxX && area.y + area.h <= view.maxY
    if (!visible || editor.getZoomLevel() > 0.8) editor.zoomToBounds(visible ? view : area, { animation: { duration: 300 }, inset: visible ? 0 : 48, targetZoom: 0.8 })
  }

  // Models tend to bunch cues into the first seconds; spread them over the spoken sentence so ink tracks the voice.
  const spokenMs = beat.speech.trim().split(/\s+/).length * SPOKEN_MS_PER_WORD
  const lastCue = Math.max(0, ...beat.actions.map(action => action.atMs))
  const cueStretch = !context.diagramId && lastCue > 0 && lastCue < spokenMs * 0.75 ? (spokenMs * 0.75) / lastCue : 1
  const visibleActions = beat.actions.filter(action => action._type === 'stroke' || action._type === 'text' || action._type === 'arrow').length
  const actionBudget = Math.max(180, spokenMs * 0.75 / Math.max(1, visibleActions))

  for (const action of beat.actions) {
    const remainingCue = action.atMs * cueStretch - (performance.now() - startedAt)
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
    if (action._type === 'move') {
      const targets = editor.getCurrentPageShapes().filter(shape => shape.meta?.owner === 'agent' && shape.meta?.lessonId === context.lessonId && shape.meta?.actionId === action.targetId)
      const moveState = (targets[0]?.meta as any)?.agentMoves?.[action.id] as { beatId: string; progress: number; toX: number; toY: number; complete: boolean } | undefined
      if (!targets.length) { context.onAction?.(`Could not find agent mark ${action.targetId} to move`); continue }
      if (moveState?.beatId === beat.beatId && moveState.complete) { completedIds.push(...targets.map(shape => shape.id)); continue }
      const startProgress = moveState?.beatId === beat.beatId ? moveState.progress : 0
      const from = targets.map(shape => ({ x: shape.x, y: shape.y }))
      const to = targets.map(shape => ({
        x: moveState?.beatId === beat.beatId ? moveState.toX + (shape.x - targets[0].x) : shape.x + action.dx,
        y: moveState?.beatId === beat.beatId ? moveState.toY + (shape.y - targets[0].y) : shape.y + action.dy,
      }))
      const bounds = editor.getShapesPageBounds(targets.map(shape => shape.id))
      if (bounds) {
        const start = { x: bounds.midX, y: bounds.midY }
        await guideCursor(context.onCursor, cursorPoint, start, context.signal)
        cursorPoint = start
        for (let progress = startProgress + 1; progress <= 10; progress++) {
          if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
          const shiftX = to[0].x - from[0].x
          const shiftY = to[0].y - from[0].y
          for (const [index, shape] of targets.entries()) {
            const deltaX = to[index].x - from[index].x
            const deltaY = to[index].y - from[index].y
            editor.updateShape({ id: shape.id, type: shape.type, x: from[index].x + deltaX * ((progress - startProgress) / (10 - startProgress)), y: from[index].y + deltaY * ((progress - startProgress) / (10 - startProgress)), meta: { ...shape.meta, agentMoves: { ...(shape.meta as any).agentMoves, [action.id]: { beatId: beat.beatId, progress, toX: to[index].x, toY: to[index].y, complete: false } } } } as any)
          }
          cursorPoint = { x: start.x + shiftX * (progress - startProgress) / (10 - startProgress), y: start.y + shiftY * (progress - startProgress) / (10 - startProgress) }
          context.onCursor?.(cursorPoint)
          await wait(18, context.signal)
        }
        for (const [index, shape] of targets.entries()) editor.updateShape({ id: shape.id, type: shape.type, x: to[index].x, y: to[index].y, meta: { ...shape.meta, agentMoves: { ...(shape.meta as any).agentMoves, [action.id]: { beatId: beat.beatId, progress: 10, toX: to[index].x, toY: to[index].y, complete: true } } } } as any)
        cursorPoint = { x: start.x + to[0].x - from[0].x, y: start.y + to[0].y - from[0].y }
      }
      context.onAction?.(`Moved ${action.targetId}`)
      completedIds.push(...targets.map(shape => shape.id))
      continue
    }

    const id = createShapeId(`lesson-${context.lessonId}-${context.checkpointIndex}-${beat.beatId}-${action.id}`)
    const existing = editor.getShape(id)
    if (action._type === 'text') {
      previousTextId = id
      const planned = textPlanned.get(action.id)
      previousTextPlanned = planned ? { x: planned.x, y: planned.y + 8 } : { x: origin.x + action.x, y: origin.y + action.y }
    } else if (action._type !== 'arrow') {
      previousTextId = null
      previousTextPlanned = null
    }
    if (existing?.meta?.actionState === 'complete') { completedIds.push(id); continue }

    if (action._type === 'stroke') {
      let progress = Math.max(0, Math.min(action.points.length, Number(existing?.meta?.actionProgress) || 0))
      if (action.points.length) {
        const start = action.points[Math.max(0, progress - 1)]
        const next = { x: origin.x + start.x, y: origin.y + start.y }
        editor.centerOnPoint(next, { animation: { duration: 220 } })
        await guideCursor(context.onCursor, cursorPoint, next, context.signal)
        cursorPoint = next
      }
      const strokePoints = () => smoothStrokePoints(action.points.slice(0, progress), action.closed && progress === action.points.length).map(point => ({ ...point, z: 0.5 }))
      if (!existing) {
        progress = Math.min(2, action.points.length)
        editor.createShape({
          id, type: 'draw', x: origin.x, y: origin.y, meta: metaFor(action, progress === action.points.length ? 'complete' : 'interrupted', progress),
          props: { color: action.color, fill: 'none', dash: 'draw', size: 'xl', segments: compressLegacySegments([{ type: 'free', points: strokePoints() }]), isComplete: progress === action.points.length, isClosed: action.closed, isPen: true, scale: 1, scaleX: 1, scaleY: 1 },
        } as any)
      }
      try {
        const frameMs = 16 * pace
        const step = context.diagramId ? 1 : Math.max(1, Math.ceil(action.points.length / Math.max(1, actionBudget / frameMs)))
        while (progress < action.points.length) {
          if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
          progress = Math.min(action.points.length, progress + step)
          const point = action.points[progress - 1]
          cursorPoint = { x: origin.x + point.x, y: origin.y + point.y }
          context.onCursor?.(cursorPoint)
          editor.updateShape({ id, type: 'draw', meta: metaFor(action, progress === action.points.length ? 'complete' : 'interrupted', progress), props: { segments: compressLegacySegments([{ type: 'free', points: strokePoints() }]), isComplete: progress === action.points.length } } as any)
          await wait(frameMs, context.signal)
        }
      } catch (error) {
        editor.updateShape({ id, type: 'draw', meta: metaFor(action, 'interrupted', progress) } as any)
        throw error
      }
      context.onAction?.(`Inked ${action.id}`)
    } else if (action._type === 'arrow') {
      // A labelled connector: the pen travels from tail to head, the shaft grows behind it, then its words appear.
      const steps = 12
      let progress = Math.max(0, Math.min(steps, Number(existing?.meta?.actionProgress) || 0))
      const modelTail = { x: origin.x + action.from.x, y: origin.y + action.from.y }
      const target = relocatedTextPoint({ x: origin.x + action.to.x, y: origin.y + action.to.y })
      const previousText = previousTextId && editor.getShape(previousTextId)
      const previousTextAction = previousTextId && beat.actions.find(item => item._type === 'text' && createShapeId(`lesson-${context.lessonId}-${context.checkpointIndex}-${beat.beatId}-${item.id}`) === previousTextId)
      const textBounds = previousTextAction?._type === 'text' ? textBoxes.get(previousTextAction.id) : undefined
      const tail = textBounds && previousText && previousTextPlanned &&
        modelTail.x >= previousTextPlanned.x - 48 && modelTail.x <= previousTextPlanned.x + textBounds.w + 48 &&
        modelTail.y >= previousTextPlanned.y - 48 && modelTail.y <= previousTextPlanned.y + textBounds.h + 48
        ? renderedTextEnd(previousTextId!, modelTail) : modelTail
      previousTextId = null
      previousTextPlanned = null
      const reach = { x: target.x - tail.x, y: target.y - tail.y }
      // Never a zero-length shaft: the first frame already has a visible length, and the direction is kept.
      const at = (fraction: number) => { const grown = Math.max(fraction, 1 / steps); return { x: reach.x * grown, y: reach.y * grown } }
      editor.centerOnPoint(tail, { animation: { duration: 220 } })
      await guideCursor(context.onCursor, cursorPoint, tail, context.signal)
      cursorPoint = tail
      const arrowProps = (fraction: number, labelled: boolean) => ({
        kind: 'arc', start: { x: 0, y: 0 }, end: at(fraction), bend: action.bend * fraction,
        color: action.color, labelColor: action.color, size: 'm', scale: 1, font: 'draw', dash: 'draw', fill: 'none',
        arrowheadStart: action.both ? 'arrow' : 'none', arrowheadEnd: 'arrow', labelPosition: 0.5,
        richText: toRichText(labelled ? action.label : ''),
      })
      if (!existing) editor.createShape({ id, type: 'arrow', x: tail.x, y: tail.y, meta: metaFor(action, 'interrupted', 0), props: arrowProps(1 / steps, false) } as any)
      try {
        const frameMs = Math.max(18, Math.min(60, actionBudget / steps)) * (pace / BEAT_PACE)
        while (progress < steps) {
          if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
          progress += 1
          const fraction = progress / steps
          const done = progress === steps
          cursorPoint = { x: tail.x + reach.x * fraction, y: tail.y + reach.y * fraction }
          context.onCursor?.(cursorPoint)
          editor.updateShape({ id, type: 'arrow', meta: metaFor(action, done ? 'complete' : 'interrupted', progress), props: arrowProps(fraction, done) } as any)
          await wait(frameMs, context.signal)
        }
      } catch (error) {
        editor.updateShape({ id, type: 'arrow', meta: metaFor(action, 'interrupted', progress) } as any)
        throw error
      }
      context.onAction?.(`Drew the "${action.label}" arrow`)
    } else if (action._type === 'widget') {
      // A ready-made data widget: placed in one action, then revealed row by row / bar by bar while the tutor speaks.
      const steps = 10
      const size = getWidgetSize(action, action.w, action.h)
      let progress = Math.max(0, Math.min(steps, Number(existing?.meta?.actionProgress) || 0))
      let corner = { x: origin.x + action.x, y: origin.y + action.y }
      const { _type, id: _actionId, atMs: _atMs, x: _x, y: _y, ...props } = action
      if (!existing) {
        editor.createShape({ id, type: 'lesson-widget', x: corner.x, y: corner.y, meta: metaFor(action, 'interrupted', 0), props: { ...props, ...size, shown: 0 } } as any)
        clearShapeOverlaps(editor, id)
      }
      const placed = editor.getShape(id)
      if (placed) corner = { x: placed.x, y: placed.y }
      editor.centerOnPoint(corner, { animation: { duration: 220 } })
      await guideCursor(context.onCursor, cursorPoint, corner, context.signal)
      cursorPoint = corner
      try {
        while (progress < steps) {
          if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
          progress += 1
          cursorPoint = { x: corner.x + size.w * (progress / steps), y: corner.y + size.h * 0.6 }
          context.onCursor?.(cursorPoint)
          editor.updateShape({ id, type: 'lesson-widget', meta: metaFor(action, progress === steps ? 'complete' : 'interrupted', progress), props: { shown: progress / steps } } as any)
          await wait(90 * pace, context.signal)
        }
      } catch (error) {
        editor.updateShape({ id, type: 'lesson-widget', meta: metaFor(action, 'interrupted', progress) } as any)
        throw error
      }
      context.onAction?.(`Placed ${action.kind} widget ${action.title}`)
    } else {
      let progress = Math.max(0, Math.min(action.text.length, Number(existing?.meta?.actionProgress) || 0))
      const textBox = textPlanned.get(action.id)
      const textPoint = { x: textBox ? textBox.x + 8 : origin.x + action.x, y: textBox ? textBox.y + 8 : origin.y + action.y }
      const size = action.size === 's' || action.size === 'm' ? 'l' : action.size
      if (!existing) {
        editor.createShape({ id, type: 'text', x: textPoint.x, y: textPoint.y, meta: metaFor(action, 'interrupted', 0), props: { richText: toRichText(action.text), color: action.color, size, scale: 3, font: 'draw', autoSize: true } } as any)
        const placed = editor.getShape(id)
        const placedBounds = placed && editor.getShapePageBounds(placed)
        if (placedBounds) textBoxes.set(action.id, placedBounds)
        editor.updateShape({ id, type: 'text', props: { richText: toRichText('') } } as any)
      } else editor.updateShape({ id, type: 'text', props: { size, scale: 3, font: 'draw', autoSize: true } } as any)
      const placedText = editor.getShape(id)
      const textCursor = () => renderedTextEnd(id, placedText ? { x: placedText.x, y: placedText.y } : textPoint)
      editor.centerOnPoint(textCursor(), { animation: { duration: 220 } })
      await guideCursor(context.onCursor, cursorPoint, textCursor(), context.signal)
      cursorPoint = textCursor()
      try {
        const frameMs = 22 * pace
        const step = context.diagramId ? 1 : Math.max(2, Math.ceil(action.text.length / Math.max(1, actionBudget / frameMs)))
        while (progress < action.text.length) {
          if (context.signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
          progress = Math.min(action.text.length, progress + step)
          editor.updateShape({ id, type: 'text', meta: metaFor(action, progress === action.text.length ? 'complete' : 'interrupted', progress), props: { richText: toRichText(action.text.slice(0, progress)), size, scale: 3, font: 'draw', autoSize: true } } as any)
          await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
          cursorPoint = textCursor()
          context.onCursor?.(cursorPoint)
          await wait(frameMs, context.signal)
        }
      } catch (error) {
        editor.updateShape({ id, type: 'text', meta: metaFor(action, 'interrupted', progress) } as any)
        throw error
      }
      context.onAction?.(`Wrote ${action.text}`)
    }
    completedIds.push(id)
  }

  return getTeachingExecutionState(editor, context.lessonId, beat.beatId)
}

export function getTeachingExecutionState(editor: Editor, lessonId: string, beatId: string): TeachingExecutionState {
  const actions = new Map<string, TeachingExecutionState['actions'][number]>()
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.meta?.owner !== 'agent' || shape.meta?.lessonId !== lessonId) continue
    if (shape.meta?.beatId === beatId) actions.set(String(shape.meta?.actionId || shape.id), {
      id: String(shape.meta?.actionId || shape.id),
      state: shape.meta?.actionState === 'complete' ? 'complete' : 'interrupted',
      progress: Number(shape.meta?.actionProgress) || 0,
    })
    for (const [id, move] of Object.entries((shape.meta as any).agentMoves || {}) as Array<[string, { beatId: string; progress: number; complete: boolean }]>) {
      if (move.beatId === beatId) actions.set(id, { id, state: move.complete ? 'complete' : 'interrupted', progress: move.progress })
    }
  }
  return { beatId, actions: [...actions.values()] }
}

/** A bounded spatial readout for the tutor's next drawing decision. Coordinates match its 1200 x 700 beat area. */
export function getWhiteboardContext(editor: Editor, lessonId: string, checkpointIndex: number) {
  const shapes = editor.getCurrentPageShapes()
  const own = shapes.filter(shape => shape.meta?.owner === 'agent' && shape.meta?.lessonId === lessonId && shape.meta?.checkpointId === String(checkpointIndex) && !shape.meta?.diagramId)
  const existingTutor = shapes.filter(shape => shape.meta?.owner === 'agent' && shape.meta?.lessonId === lessonId).slice(-48).flatMap(shape => {
    const bounds = editor.getShapePageBounds(shape)
    return bounds ? [{ checkpoint: shape.meta?.checkpointId, beatId: shape.meta?.beatId, actionId: shape.meta?.actionId, type: shape.type,
      text: (editor.getShapeUtil(shape).getText(shape as any) || '').slice(0, 80), x: Math.round(bounds.x), y: Math.round(bounds.y),
      w: Math.round(bounds.w), h: Math.round(bounds.h), state: shape.meta?.actionState }] : []
  })
  const learner = shapes.filter(shape => !shape.meta?.owner && ['draw', 'text', 'arrow', 'highlight'].includes(shape.type)).slice(-24).flatMap(shape => {
    const bounds = editor.getShapePageBounds(shape)
    return bounds ? [{ type: shape.type, text: (editor.getShapeUtil(shape).getText(shape as any) || '').slice(0, 80),
      x: Math.round(bounds.x), y: Math.round(bounds.y), w: Math.round(bounds.w), h: Math.round(bounds.h) }] : []
  })
  const latest = [...own].reverse().find(shape => typeof shape.meta?.originX === 'number' && typeof shape.meta?.originY === 'number')
  if (!latest) return JSON.stringify({ area: 'Whole board; global coordinates', tutor: [], existingTutor, learner })
  const origin = { x: latest.meta.originX as number, y: latest.meta.originY as number }
  const inArea = (shape: (typeof shapes)[number]) => {
    const bounds = editor.getShapePageBounds(shape)
    return bounds && bounds.x < origin.x + DRAWING_AREA.w && bounds.x + bounds.w > origin.x && bounds.y < origin.y + DRAWING_AREA.h && bounds.y + bounds.h > origin.y
  }
  const mark = (shape: (typeof shapes)[number]) => {
    const bounds = editor.getShapePageBounds(shape)!
    return {
      beatId: shape.meta?.beatId || undefined,
      actionId: shape.meta?.actionId || undefined,
      type: shape.type,
      text: (editor.getShapeUtil(shape).getText(shape as any) || '').slice(0, 80),
      x: Math.round(bounds.x - origin.x), y: Math.round(bounds.y - origin.y),
      w: Math.round(bounds.w), h: Math.round(bounds.h),
      state: shape.meta?.actionState || undefined,
    }
  }
  const tutor = own.filter(shape => shape.meta?.originX === origin.x && shape.meta?.originY === origin.y && inArea(shape)).slice(-32).map(mark)
  const currentLearner = learner.filter(item => item.x < origin.x + DRAWING_AREA.w && item.x + item.w > origin.x && item.y < origin.y + DRAWING_AREA.h && item.y + item.h > origin.y)
  const seen = new Set([`${origin.x},${origin.y}`])
  const nearby = own.filter(shape => typeof shape.meta?.originX === 'number' && typeof shape.meta?.originY === 'number').reverse().flatMap(shape => {
    const key = `${shape.meta?.originX},${shape.meta?.originY}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ anchorBeatId: shape.meta?.beatId, dx: (shape.meta?.originX as number) - origin.x, dy: (shape.meta?.originY as number) - origin.y,
      labels: own.filter(item => item.meta?.originX === shape.meta?.originX && item.meta?.originY === shape.meta?.originY && item.type === 'text').slice(0, 3).map(item => (editor.getShapeUtil(item).getText(item as any) || '').slice(0, 60)) }]
  }).slice(0, 3)
  return JSON.stringify({ area: 'Latest tutor section; local coordinates 0..1200 x 0..700', tutor, existingTutor, learner: currentLearner, otherLearnerMarks: learner, nearby })
}

function selectionTarget(editor: Editor) {
  const selectedBounds = editor.getSelectionPageBounds()
  const recentMark = !selectedBounds ? [...editor.getCurrentPageShapes()].reverse().find(shape => !shape.meta?.owner && ['draw', 'arrow', 'highlight'].includes(shape.type)) : undefined
  const bounds = selectedBounds || (recentMark ? editor.getShapePageBounds(recentMark) : null)
  return bounds ? { bounds, mode: selectedBounds ? 'selection' as const : 'recent-user-mark' as const } : null
}

export async function getSelectionImage(editor: Editor): Promise<string | undefined> {
  const target = selectionTarget(editor)
  if (!target) return undefined
  const { bounds } = target
  const { url } = await editor.toImageDataUrl(editor.getCurrentPageShapes(), {
    bounds, format: 'png', background: true, padding: 24, pixelRatio: 1,
    scale: Math.min(2, 1200 / Math.max(bounds.w, 1), 900 / Math.max(bounds.h, 1)),
  })
  return url.startsWith('data:image/png;base64,') && url.length <= 2_800_000 ? url : undefined
}

export function getSelectionContext(editor: Editor): SelectionContext | null {
  const target = selectionTarget(editor)
  if (!target) return null
  const { bounds } = target
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
  return { mode: target.mode, bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }, shapes }
}
