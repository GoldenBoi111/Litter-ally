// The local Qwen host accepts at most 900 characters per request, so longer text is spoken as sentence-sized chunks.
export function speechChunks(text, max = 850) {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || []
  const chunks = []
  let current = ''
  for (const raw of sentences) {
    let sentence = raw.trim()
    while (sentence.length > max) {
      const cut = sentence.lastIndexOf(' ', max) > max / 2 ? sentence.lastIndexOf(' ', max) : max
      if (current) { chunks.push(current); current = '' }
      chunks.push(sentence.slice(0, cut).trim())
      sentence = sentence.slice(cut).trim()
    }
    if (!sentence) continue
    if (current && current.length + 1 + sentence.length > max) { chunks.push(current); current = sentence }
    else current = current ? `${current} ${sentence}` : sentence
  }
  if (current) chunks.push(current)
  return chunks
}
