import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { createWorker } from 'tesseract.js'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function recognizePdfPages(pdfData: Blob, pages: number[], onProgress: (page: number, index: number, total: number) => void) {
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdfData.arrayBuffer()) })
  const pdf = await task.promise
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined
  const recognized: Record<number, string> = {}

  try {
    try {
      worker = await createWorker('eng')
    } catch (reason) {
      const detail = reason instanceof Error ? ` ${reason.message}` : ''
      throw new Error(`The local English OCR engine could not be downloaded. Check your internet connection and retry.${detail}`)
    }
    for (const [index, pageNumber] of pages.entries()) {
      onProgress(pageNumber, index + 1, pages.length)
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('This browser could not render a scanned PDF page for text recognition.')
      await page.render({ canvas, canvasContext: context, viewport }).promise
      recognized[pageNumber] = (await worker.recognize(canvas)).data.text.trim()
      canvas.width = 0
      canvas.height = 0
    }
  } finally {
    await worker?.terminate()
    await task.destroy()
  }

  return recognized
}

export async function recognizeImage(image: Blob) {
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(image, {}, { blocks: true })
    const paragraphs = data.blocks?.flatMap(block => block.paragraphs) || []
    return paragraphs.filter(paragraph => paragraph.text.trim()).map((paragraph, index) => ({
      id: `image:paragraph:${index + 1}`,
      text: paragraph.text.trim(),
      locator: { kind: 'image-region' as const, x: paragraph.bbox.x0, y: paragraph.bbox.y0, width: paragraph.bbox.x1 - paragraph.bbox.x0, height: paragraph.bbox.y1 - paragraph.bbox.y0 },
    }))
  } finally {
    await worker.terminate()
  }
}
