export async function createStructuredResponse({ apiKey, model, instructions, input, name, schema, timeoutMs = 90_000, refusalMessage = 'The model declined this request.', reasoningEffort = 'low' }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, instructions, input, reasoning: { effort: reasoningEffort },
      text: { format: { type: 'json_schema', name, strict: true, schema } },
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error?.message || `OpenAI returned HTTP ${response.status}.`)
  for (const item of result.output || []) for (const content of item.content || []) {
    if (content.type === 'refusal') throw new Error(content.refusal || refusalMessage)
    if (content.type === 'output_text') return JSON.parse(content.text)
  }
  throw new Error('OpenAI returned no structured response.')
}
