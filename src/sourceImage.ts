import { AssetRecordType, createShapeId, toRichText, type Editor } from 'tldraw'

function dataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not open this image.'))
    reader.onerror = () => reject(reader.error || new Error('Could not open this image.'))
    reader.readAsDataURL(blob)
  })
}

export async function placeSourceImage(editor: Editor, image: Blob, sourceId: string, sourceTitle: string, checkpointIndex: number, signal: AbortSignal, frameId = 'image', xOffset = 0) {
  if (signal.aborted) throw new DOMException('Lesson paused.', 'AbortError')
  const shapeId = createShapeId(`source-${sourceId}-${frameId}`)
  const existing = editor.getShape(shapeId)
  if (existing) {
    editor.select(shapeId)
    editor.zoomToSelection({ animation: { duration: 350 } })
    return { message: 'The source image is already on the canvas.' }
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
      editor.createAssets([{
        id: assetId, type: 'image', typeName: 'asset',
        props: { name: sourceTitle, src: await dataUrl(preview), w: bitmap.width * scale, h: bitmap.height * scale, mimeType: 'image/jpeg', isAnimated: false },
        meta: { owner: 'source', sourceId },
      }])
    }
    editor.createShape({
      id: shapeId, type: 'image', x: checkpointIndex * 2400 + xOffset, y: 220,
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
    return { message: 'Placed the source image on the canvas. Select it and ask the tutor about its visual details.' }
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
