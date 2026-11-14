/**
 * Language level, tuned with AIMD (additive increase, multiplicative decrease), the rule TCP uses for its sending rate.
 * Level 1 is everyday words with every term defined; level 10 is the source's own technical register.
 * When the learner keeps up the level creeps up by one; when they struggle it halves, so confusion drops the jargon
 * at once and complexity is earned back slowly.
 */

export const AIMD = { min: 1, max: 10, start: 5, increase: 1, decrease: 0.5 } as const

export type AimdSignal = 'understood' | 'struggled' | 'neutral'

export function nextLevel(level: number, signal: AimdSignal): number {
  const current = Math.min(AIMD.max, Math.max(AIMD.min, Math.round(level) || AIMD.start))
  if (signal === 'understood') return Math.min(AIMD.max, current + AIMD.increase)
  if (signal === 'struggled') return Math.max(AIMD.min, Math.floor(current * AIMD.decrease))
  return current
}

const STRUGGLE = [
  /\bwhat (does|do|is|are)\b.{1,60}\b(mean|means)\b/i,
  /\bwhat('s| is) (a|an|the)?\s*\w+\??$/i,
  /\b(i('m| am) (lost|confused)|confus(ed|ing)|don'?t (get|understand|follow)|didn'?t (get|understand|follow)|no idea|not sure what)\b/i,
  /\b(simpler|in plain (english|words|terms)|eli5|explain (it )?(again|differently)|too (technical|complicated|complex|fast))\b/i,
]
const KEEPING_UP = [
  /\b(i know (this|that)|already know|got it|makes sense|that'?s clear|easy)\b/i,
  /\b(go deeper|more detail|more technical|skip (this|ahead)|faster|the actual (math|mechanism|equation))\b/i,
]

/** Reads a learner message for a level signal with cheap rules, so live voice turns cost no extra model call. */
export function readLearnerSignal(text: string): AimdSignal {
  const message = text.trim()
  if (!message) return 'neutral'
  if (STRUGGLE.some(rule => rule.test(message))) return 'struggled'
  if (KEEPING_UP.some(rule => rule.test(message))) return 'understood'
  return 'neutral'
}

export function levelLabel(level: number) {
  return level <= 3 ? 'Everyday words' : level <= 6 ? 'Key terms, explained' : level <= 8 ? 'Field vocabulary' : 'Technical'
}

/** The instruction the tutor follows for a level. */
export function languageGuide(level: number) {
  const band = level <= 3
    ? 'Use everyday words and short sentences. Avoid jargon; when a technical term is unavoidable, define it the moment you use it with an everyday comparison. One idea at a time.'
    : level <= 6
      ? 'Use the source\'s key terms, but define each one plainly the first time it appears, and add an example for abstract ideas. Introduce at most one new term per explanation.'
      : level <= 8
        ? 'Use the field\'s normal vocabulary; define only uncommon or source-specific terms. You can move at a steady pace and connect ideas directly.'
        : 'Speak at the source\'s own technical level: precise terminology, mechanisms and quantities, defining only rare terms.'
  return `Language level ${level}/10 (${levelLabel(level)}). ${band} If the learner seems lost, simplify immediately.`
}
