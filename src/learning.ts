import { readApiJson, type ExtractedKnowledgeUpdate, type LearningEvidence } from './storage'
import type { TeachingPlan } from './lessonAgent'
export type { LearningEvidence } from './storage'

export type LearningStatus = 'clear' | 'partial' | 'review'
export const defaultLearningGoal = 'Learn what this material actually says: its specific points, facts, and conclusions, in order.'

export type AnswerReview = {
  status: LearningStatus
  feedback: string
  conceptResults: Array<{ concept: string; status: LearningStatus }>
}

export type PracticeQuestion = {
  question: string
  concepts: string[]
  hint: string
  sourcePages: number[]
}

export type PracticeCheckpoint = { title: string; goal: string; concepts: string[]; sourcePages: number[] }
export type LearningDiagnostic = {
  goal: string
  questions: Array<{ concept: string; question: string }>
  answers?: string[]
}

export async function assessAnswer(input: {
  paperTitle: string
  question: string
  answer: string
  concepts: string[]
  goal: string
  sourcePages: number[]
  paperEvidence: Array<{ pageNumber: number; text: string }>
}) {
  return readApiJson<AnswerReview>(fetch('/api/learning/assess', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }), 'The learning service')
}

export async function requestLearningDiagnostic(input: {
  paperTitle: string
  sourceKind?: string
  learningGoal?: string
  pageCount: number
  text: string
  knowledge: Array<{ concept: string; status: LearningStatus }>
  evidence?: LearningEvidence[]
  priorKnowledge?: { propositions: Array<{ id: string; concept: string; statement: string }>; reasoningLinks: Array<{ source: string; target: string; relationType: 'explicit' | 'inferred'; reason: string }> }
}) {
  return readApiJson<LearningDiagnostic>(fetch('/api/teach', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, title: input.paperTitle, stage: 'diagnose' }),
  }), 'The learning service')
}

export async function requestAdaptivePlan(input: {
  paperTitle: string
  sourceKind?: string
  pageCount: number
  text: string
  knowledge: Array<{ concept: string; status: LearningStatus }>
  evidence?: LearningEvidence[]
  priorKnowledge?: { propositions: Array<{ id: string; concept: string; statement: string }>; reasoningLinks: Array<{ source: string; target: string; relationType: 'explicit' | 'inferred'; reason: string }> }
  diagnostic: LearningDiagnostic
  answers: string[]
}) {
  return readApiJson<import('./lessonAgent').TeachingPlan>(fetch('/api/teach', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, title: input.paperTitle, stage: 'plan' }),
  }), 'The learning service')
}

/** Hybrid planning (server/deep-course): checkpoint 1 now, plus a background job that plans checkpoints 2..N. */
export type CourseJobStatus = { id: string; status: 'running' | 'done' | 'failed'; stage: string; error?: string }

export async function requestFastPlan(input: {
  paperTitle: string
  sourceKind?: string
  pageCount: number
  text: string
  learningGoal: string
  projectId?: string | null
  languageLevel?: number
  knowledge: Array<{ concept: string; status: LearningStatus }>
  evidence?: LearningEvidence[]
  priorKnowledge?: { propositions: Array<{ id: string; concept: string; statement: string }>; reasoningLinks: Array<{ source: string; target: string; relationType: 'explicit' | 'inferred'; reason: string }> }
}) {
  const { paperTitle, projectId, ...rest } = input
  return readApiJson<{ plan: TeachingPlan; jobId: string; projectId: string }>(fetch('/api/course/fast', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...rest, title: paperTitle, ...(projectId ? { projectId } : {}) }),
  }), 'The planning service')
}

export async function readCourseJob(jobId: string) {
  return readApiJson<CourseJobStatus>(fetch(`/api/course/jobs/${encodeURIComponent(jobId)}`), 'The planning service')
}

/** Merges the background checkpoints after the learner's current plan; the server always keeps checkpoint 1. */
export async function mergeCourseJob(jobId: string, input: { currentPlan: TeachingPlan; completedCount: number; pageCount: number }) {
  return readApiJson<TeachingPlan>(fetch(`/api/course/jobs/${encodeURIComponent(jobId)}/merge`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }), 'The planning service')
}

export type DiagnosticTurn = { role: 'tutor' | 'learner'; text: string }
export type DiagnosticReply = { done: boolean; question: string; lastAnswerSignal: 'understood' | 'struggled' | 'neutral'; signalReason: string; summary: string }

/** One turn of the diagnostic conversation. With no learner turns yet, the server answers instantly with the opening question. */
export async function requestDiagnosticTurn(input: { paperTitle: string; sourceKind?: string; pageCount: number; text: string; projectId?: string | null; turns: DiagnosticTurn[]; languageGuide: string }) {
  const { paperTitle, projectId, ...rest } = input
  return readApiJson<DiagnosticReply>(fetch('/api/course/diagnose', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...rest, title: paperTitle, ...(projectId ? { projectId } : {}) }),
  }), 'The diagnostic agent')
}

/** Hands the diagnostic's findings to the background planner while it is still working. */
export async function shareDiagnosticWithPlanner(jobId: string, input: { languageLevel: number; diagnosticSummary: string }) {
  return readApiJson<{ ok: boolean; plannerStillRunning: boolean }>(fetch(`/api/course/jobs/${encodeURIComponent(jobId)}/learner`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  }), 'The planning service')
}

export async function requestAdaptiveRevision(input: {
  paperTitle: string
  sourceKind?: string
  pageCount: number
  text: string
  currentPlan: TeachingPlan
  completedCount: number
  knowledge: Array<{ concept: string; status: LearningStatus }>
  evidence?: LearningEvidence[]
  priorKnowledge: {
    propositions: Array<{ id: string; concept: string; statement: string }>
    chains: Array<{ id: string; premises: string[]; conclusion: string; reason: string }>
  }
}) {
  return readApiJson<TeachingPlan>(fetch('/api/teach', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, title: input.paperTitle, stage: 'revise' }),
  }), 'The learning service')
}

export async function requestPracticeQuestion(input: {
  paperTitle: string
  checkpoint: PracticeCheckpoint
  paperEvidence: Array<{ pageNumber: number; text: string }>
  knowledge: Array<{ concept: string; status: LearningStatus }>
  previousQuestions: string[]
  evidence?: LearningEvidence[]
  priorKnowledge?: {
    propositions: Array<{ id: string; concept: string; statement: string }>
    chains: Array<{ id: string; premises: string[]; conclusion: string; reason: string }>
  }
}) {
  return readApiJson<PracticeQuestion>(fetch('/api/learning/practice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }), 'The learning service')
}

export async function extractTaughtKnowledge(input: {
  paperTitle: string
  pageCount: number
  text: string
  checkpoint: { title: string; goal: string; sourcePages: number[] }
  teacherTranscript: string
  priorKnowledge: {
    propositions: Array<{ id: string; concept: string; statement: string }>
    chains: Array<{ id: string; premises: string[]; conclusion: string; reason: string }>
  }
}) {
  return readApiJson<ExtractedKnowledgeUpdate>(fetch('/api/learning/knowledge', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, title: input.paperTitle }),
  }), 'The learning service')
}
