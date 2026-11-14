const MAX_PAGE_TEXT = 12_000

export function readPaperPage(text, pageNumber, pageCount) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
    return `Page number must be between 1 and ${pageCount}.`
  }
  const marker = new RegExp(`^\\[Page ${pageNumber}(?: of \\d+)?\\]\\s*$`, 'm').exec(text)
  if (!marker) return `Text for page ${pageNumber} is unavailable. Open its rendered page or re-import the paper.`
  const start = marker.index + marker[0].length
  const next = /^\[Page \d+(?: of \d+)?\]\s*$/gm
  next.lastIndex = start
  const end = next.exec(text)?.index ?? text.length
  const pageText = text.slice(start, end).trim()
  if (!pageText) return `No readable text was extracted for page ${pageNumber}. Open its rendered page or re-import the paper.`
  return `[Page ${pageNumber} of ${pageCount}]\n${pageText.slice(0, MAX_PAGE_TEXT)}${pageText.length > MAX_PAGE_TEXT ? '\n[Page text truncated.]' : ''}`
}

export function readPaperEvidence(text, pageNumbers, pageCount) {
  return [...new Set(pageNumbers)].map(pageNumber => ({
    pageNumber,
    text: readPaperPage(text, pageNumber, pageCount),
  })).filter(page => page.text.startsWith(`[Page ${page.pageNumber} of `))
}
