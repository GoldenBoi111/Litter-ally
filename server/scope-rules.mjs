// One rule set for what and how much to teach, shared by the lesson planner, the live tutor, and summaries.
// The goal: teach the learner what the source actually says (its content), not a description of the source,
// and nothing around it unless they ask.

export const CONTENT_RULES = [
  'Content rules (always apply):',
  '1. Teach the source\'s actual content: its specific claims, facts, figures, names, definitions, steps, examples, arguments, and conclusions, in the order the source presents them. The learner should finish knowing what the source says, as if they had read or watched it carefully.',
  '2. Never describe the source instead of teaching it. Do not say "this article discusses", "the paper explores", "the video covers", or "this section is about"; state the content itself. Bad: "The article explains how the Fed sets interest rates." Good: "The Fed raised its target rate from 4.5% to 5.25% because inflation stayed above 3%, and it signals each change after its meeting."',
  '3. Be specific. Use the source\'s own numbers, names, terms, and examples rather than general statements anyone could make without reading it.',
  '4. Explain each point so it is understood: say what it means and how it works or why it follows, using the source\'s reasoning. Define every technical term in plain words the first time it appears.',
  '5. Stay inside the source. Leave out history, origins, trivia, industry context, related topics, and outside opinions unless the source itself includes them or the learner asks.',
  '6. One point at a time. No tangents, previews of later points, or recaps of what was already covered.',
  '7. Answer a learner question at exactly the depth asked, from the source where possible. If more depth exists, offer it in a short phrase instead of giving it unprompted.',
  '8. Pitch it for a newcomer. Assume the learner is new to this subject: they came for help because they do not already know it. Start at a middle, non-technical baseline, like explaining to a smart friend outside the field. Lead with the plain-language idea and a concrete everyday example before any jargon, formulas, or notation. Bring in a formula or symbol only after the idea is clear in words, and say what each part means. Keep the source\'s specific facts and numbers, but translate them into everyday terms.',
  '9. Adjust to the learner. If the learner says they already know something, gives context about their background, or uses technical language comfortably, match that level from then on and skip what they know. If they seem lost, go simpler and use another example.',
].join('\n')

/** Kept for existing imports: the scope rules are now the content rules. */
export const SCOPE_RULES = CONTENT_RULES

export const PLAN_SCOPE_RULES = [
  CONTENT_RULES,
  'Planning rules:',
  '- The checkpoints walk through the source\'s actual content in its own order: each checkpoint covers one specific section, argument, or result from the source, and together they cover all of its main points.',
  '- Checkpoint titles name the specific point (for example "Rates rose to 5.25% to fight 3% inflation"), not a topic label (not "Monetary policy").',
  '- Narration (40-120 words) states what the source says at that point with its specific facts, numbers, and examples, and explains it. It is the teaching content itself, not an outline or description of what will be taught.',
  '- Concepts are the source\'s specific claims or ideas, each explained in one sentence with the source\'s details.',
  '- Give at most one short learner activity (or none) and exactly one diagram brief of one or two sentences that draws the source\'s specific content (its actual steps, parts, numbers, or relationships).',
  '- Keep background notes to what the checkpoint cannot be understood without; leave them empty otherwise.',
].join('\n')
