import { AssetRecordType, createShapeId, type Editor } from 'tldraw'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { materialSpot } from './sourceImage'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function placePdfPage(editor: Editor, pdfData: Blob, paperId: string, pageNumber: number, checkpointIndex: number, signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
  const shapeId = createShapeId(`paper-${paperId}-page-${pageNumber}`)
  const existing = editor.getShape(shapeId)
  if (existing) {
    editor.select(shapeId)
    editor.zoomToSelection({ animation: { duration: 350 } })
    return { message: `Page ${pageNumber} is already on the canvas.`, imageUrl: await editor.toImageDataUrl([shapeId], { format: 'png', background: true }).then(result => result.url) }
  }

  const task = pdfjs.getDocument({ data: new Uint8Array(await pdfData.arrayBuffer()) })
  try {
    const pdf = await task.promise
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) throw new Error(`Page ${pageNumber} is outside this ${pdf.numPages}-page paper.`)
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser could not render the PDF page.')
    await page.render({ canvas, canvasContext: context, viewport }).promise
    if (signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
    const imageUrl = canvas.toDataURL('image/jpeg', 0.9)
    const assetId = AssetRecordType.createId(`paper-${paperId}-page-${pageNumber}`)
    const createdAsset = !editor.getAsset(assetId)
    if (createdAsset) {
      editor.createAssets([{
        id: assetId,
        type: 'image',
        typeName: 'asset',
        props: { name: `Page ${pageNumber}.jpg`, src: imageUrl, w: viewport.width, h: viewport.height, mimeType: 'image/jpeg', isAnimated: false },
        meta: { owner: 'source', paperId, pageNumber },
      }])
    }
    const spot = materialSpot(editor, checkpointIndex, viewport.width, viewport.height)
    editor.createShape({
      id: shapeId,
      type: 'image',
      x: spot.x,
      y: spot.y,
      meta: { owner: 'source', paperId, pageNumber, checkpointId: String(checkpointIndex) },
      props: { assetId, w: viewport.width, h: viewport.height, altText: `Page ${pageNumber} of the imported paper` },
    })
    if (signal.aborted) {
      editor.deleteShapes([shapeId])
      if (createdAsset) editor.deleteAssets([assetId])
      throw new DOMException('Lesson paused.', 'AbortError')
    }
    editor.select(shapeId)
    editor.zoomToSelection({ animation: { duration: 350 } })
    return { message: `Placed source page ${pageNumber} on the canvas and shared its image with the tutor.`, imageUrl }
  } finally {
    await task.destroy()
  }
}
