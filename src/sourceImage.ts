import { AssetRecordType, createShapeId, toRichText, type Editor } from 'tldraw'

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not open this image.'))
    reader.onerror = () => reject(reader.error || new Error('Could not open this image.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Where the next piece of source material goes. Material keeps to its concept's own 2400-pixel column
 * (matching CONCEPT_COLUMN in lessonAgent.ts) and steps down past anything already standing there, so two
 * pages, frames or slides from one concept never land on top of each other or on the tutor's ink.
 */
export function materialSpot(editor: Editor, checkpointIndex: number, w: number, h: number, xOffset = 0) {
  const x = checkpointIndex * 2400 + xOffset
  const occupied = editor.getCurrentPageShapes().flatMap(shape => {
    const bounds = editor.getShapePageBounds(shape)
    return bounds ? [{ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }] : []
  })
  let y = 220
  for (let attempt = 0; attempt <= occupied.length; attempt++) {
    const next = occupied.reduce((lowest, box) => box.x < x + w + 24 && box.x + box.w > x - 24 && box.y < y + h + 24 && box.y + box.h > y - 24
      ? Math.max(lowest, box.y + box.h + 48) : lowest, y)
    if (next === y) break
    y = next
  }
  return { x, y }
}

export async function placeSourceImage(editor: Editor, image: Blob, sourceId: string, sourceTitle: string, checkpointIndex: number, signal: AbortSignal, frameId = 'image', xOffset = 0) {
  if (signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
  const shapeId = createShapeId(`source-${sourceId}-${frameId}`)
  const existing = editor.getShape(shapeId)
  if (existing) {
    editor.select(shapeId)
    editor.zoomToSelection({ animation: { duration: 350 } })
    const imageUrl = existing.type === 'image' && existing.props.assetId ? editor.getAsset(existing.props.assetId)?.props.src : undefined
    return { message: 'The source image is already on the canvas.', ...(typeof imageUrl === 'string' ? { imageUrl } : {}) }
  }
  const bitmap = await createImageBitmap(image)
  try {
    const assetId = AssetRecordType.createId(`source-${sourceId}-${frameId}`)
    const createdAsset = !editor.getAsset(assetId)
    if (createdAsset) {
      const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const preview = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88))
      canvas.width = 0
      canvas.height = 0
      if (!preview) throw new Error('Could not prepare this image for the canvas.')
      const imageUrl = await dataUrl(preview)
      editor.createAssets([{
        id: assetId, type: 'image', typeName: 'asset',
        props: { name: sourceTitle, src: imageUrl, w: bitmap.width * scale, h: bitmap.height * scale, mimeType: 'image/jpeg', isAnimated: false },
        meta: { owner: 'source', sourceId },
      }])
    }
    const spot = materialSpot(editor, checkpointIndex, bitmap.width, bitmap.height, xOffset)
    editor.createShape({
      id: shapeId, type: 'image', x: spot.x, y: spot.y,
      meta: { owner: 'source', sourceId, checkpointId: String(checkpointIndex) },
      props: { assetId, w: bitmap.width, h: bitmap.height, altText: sourceTitle },
    })
    if (signal.aborted) {
      editor.deleteShapes([shapeId])
      if (createdAsset) editor.deleteAssets([assetId])
      throw new DOMException('Lesson paused.', 'AbortError')
    }
    editor.select(shapeId)
    editor.zoomToSelection({ animation: { duration: 350 } })
    const imageUrl = editor.getAsset(assetId)?.props.src
    return { message: 'Placed the source image on the canvas. Select it and ask the tutor about its visual details.', ...(typeof imageUrl === 'string' ? { imageUrl } : {}) }
  } finally {
    bitmap.close()
  }
}

export async function placeOutsideImage(editor: Editor, image: Blob, info: { id: string; title: string; sourceUrl: string; credit: string; license: string; licenseUrl: string }, checkpointIndex: number, signal: AbortSignal) {
  const sourceId = `commons-${info.id}`
  const result = await placeSourceImage(editor, image, sourceId, info.title, checkpointIndex, signal, 'image', 1200)
  const imageShape = editor.getShape(createShapeId(`source-${sourceId}-image`))
  const creditId = createShapeId(`source-${sourceId}-credit`)
  if (imageShape?.type === 'image' && !editor.getShape(creditId)) editor.createShape({
    id: creditId, type: 'text', x: imageShape.x, y: imageShape.y + imageShape.props.h + 16,
    meta: { owner: 'source', sourceId, checkpointId: String(checkpointIndex), sourceUrl: info.sourceUrl },
    props: { richText: toRichText(`${info.title} · ${info.credit} · ${info.license}\n${info.sourceUrl}${info.licenseUrl ? `\n${info.licenseUrl}` : ''}`), color: 'grey', size: 's', font: 'sans', autoSize: true },
  })
  return { message: `${result.message} Credit: ${info.credit}; license: ${info.license}; source: ${info.sourceUrl}` }
}
