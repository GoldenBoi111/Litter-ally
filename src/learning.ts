import { readApiJson, type ExtractedKnowledgeUpdate, type LearningEvidence } from './storage'
import type { TeachingPlan } from './lessonAgent'
export type { LearningEvidence } from './storage'

export type LearningStatus = 'clear' | 'partial' | 'review'
export const defaultLearningGoal = 'Understand this material end to end: its key ideas, evidence, methods, limitations, and implications.'

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
