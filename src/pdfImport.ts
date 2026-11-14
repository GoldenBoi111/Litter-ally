import type { ImportedPaper } from './storage'

export type PdfExtraction = Omit<ImportedPaper, 'id' | 'importedAt'> & { scannedPages?: number[] }

export async function finishPdfExtraction(result: PdfExtraction, onProgress: (message: string) => void): Promise<Omit<PdfExtraction, 'scannedPages'>> {
  const { scannedPages = [], ...paper } = result
  if (!scannedPages.length) return paper
  if (!paper.pdfData) throw new Error('This scanned PDF has no saved page data for local text recognition. Re-import the PDF file.')
  if (scannedPages.some(page => !Number.isInteger(page) || page < 1 || page > paper.pageCount)) throw new Error('The import service returned an invalid scanned-page list.')

  const { recognizePdfPages } = await import('./ocr')
  const recognized = await recognizePdfPages(paper.pdfData, scannedPages, (page, index, total) => {
    onProgress(`Recognizing scanned page ${page} (${index} of ${total}) locally…`)
  })
  const markers = [...paper.text.matchAll(/^\[Page (\d+)\]\s*$/gm)]
  const pageText = new Map<number, string>()
  markers.forEach((marker, index) => {
    const start = marker.index! + marker[0].length
    const end = markers[index + 1]?.index ?? paper.text.length
    pageText.set(Number(marker[1]), paper.text.slice(start, end).trim())
  })
  for (const [page, text] of Object.entries(recognized)) if (text) pageText.set(Number(page), text)
  const fullText = Array.from({ length: paper.pageCount }, (_, index) => {
    const page = index + 1
    return `[Page ${page}]\n${pageText.get(page) || ''}`
  }).join('\n\n')
  if (!fullText.replace(/\[Page \d+\]/g, '').trim()) throw new Error('OCR did not find readable English text in this PDF. Try a clearer scan or an English-language PDF.')
  if (fullText.length > 1_500_000) throw new Error('The recognized text exceeds the 1.5 million character limit.')
  onProgress(`Recognized ${scannedPages.length} scanned page${scannedPages.length === 1 ? '' : 's'} locally.`)
  return { ...paper, text: fullText, characterCount: fullText.length, ocrUsed: true }
}
