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
  '8. Start from the very basics unless the learner has shown relevant knowledge. First explain the idea in ordinary words with one concrete example from the source, then define the source\'s technical terms. Introduce notation only after the learner has the plain-language idea; explain each symbol. Keep the source\'s specific facts and numbers.',
  '9. Adjust pace from the learner\'s actual interactions, like additive increase and multiplicative decrease. Each clear sign of understanding (a correct paraphrase, confident use of a term, or an explicit request to move faster) permits one small increase: use less scaffolding and shorter explanations while still teaching one source point at a time. Silence is not evidence of understanding. A sign of confusion, a mistaken explanation, or a request to slow down immediately cuts the pace back sharply: teach one smaller step, define terms again, and use a different source-grounded example or drawing. Increase gradually again only after new positive evidence. If the learner states prior knowledge or asks an advanced question, respect that level for that answer. Do not announce a level, quiz the learner, or leave the source to calibrate.',
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
  '- Give at most one short learner activity (or none) and exactly one diagram brief of one or two sentences that draws the source\'s specific content. Specify its defining parts, connections, and spatial arrangement: a neural network needs its source-described layers, nodes, and links; a cell needs the parts the source actually names. Name each relationship the drawing must label, in the words that belong on the arrow (for an API: the request with its method and path one way, the response with its status and body back). A title, isolated equation, or generic word list is not a complete diagram. When the point is data (figures, comparisons, trends, shares, or dates), the brief names the widget to use (table, bar, line, pie, stats, or timeline) and the exact values from the source.',
  '- Keep background notes to what the checkpoint cannot be understood without; leave them empty otherwise.',
].join('\n')
