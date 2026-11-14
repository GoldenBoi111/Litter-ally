export function validateVoiceRequest(body) {
  return typeof body?.title === 'string' && body.title.trim().length > 0 && body.title.length <= 300 &&
    typeof body.brief === 'string' && body.brief.length <= 30_000 &&
    Array.isArray(body.input) && body.input.length > 0 && body.input.length <= 100 &&
    body.input.every(item => item && typeof item === 'object' && ['message', 'function_call', 'function_call_output', 'reasoning'].includes(item.type))
}

export function validVoiceAudio(audio) {
  return typeof audio === 'string' && audio.length >= 4 && audio.length <= 6_500_000 && audio.length % 4 === 0 &&
    /^[A-Za-z0-9+/]*={0,2}$/.test(audio)
}

export function validSpeechText(text) {
  return typeof text === 'string' && text.trim().length > 0 && text.trim().length <= 900
}

export function safeResponsesVoiceEvents(event) {
  if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') return [{ type: 'text', text: event.delta }]
  if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') return [{ type: 'tool', call: event.item }]
  if (event.type === 'response.completed') return [{ type: 'output', output: event.response?.output || [] }, { type: 'done' }]
  if (event.type === 'error' || event.type === 'response.failed') {
    return [{ type: 'error', error: event.message || event.error?.message || event.response?.error?.message || 'The response stream failed.' }]
  }
  return []
}
