import type { ImportedPaper, SourceSegment } from './storage'

const MAX_TEXT = 1_500_000
const SEGMENT_CHARS = 10_000

function record(title: string, fileName: string, kind: NonNullable<ImportedPaper['sourceKind']>, segments: SourceSegment[]): Omit<ImportedPaper, 'id' | 'importedAt'> {
  if (!segments.length || segments.every(segment => !segment.text.trim())) throw new Error('No readable text was found in this file.')
  if (segments.length > 300 || segments.reduce((size, segment) => size + segment.text.length, 0) > MAX_TEXT) throw new Error('The extracted material exceeds the 300 section or 1.5 million character limit.')
  const pageCount = segments.length
  return {
    title, sourceUrl: '', pdfUrl: '', fileName, sourceKind: kind, sourceSegments: segments,
    pageCount, characterCount: segments.reduce((size, segment) => size + segment.text.length, 0),
    text: segments.map((segment, index) => `[Page ${index + 1} of ${pageCount}]\n${segment.text}`).join('\n\n'),
  }
}

function splitText(text: string, maxChars = SEGMENT_CHARS) {
  const lines = text.split(/\r?\n/)
  const chunks: Array<{ text: string; startLine: number; endLine: number }> = []
  let current: string[] = []
  let startLine = 1
  for (const [index, line] of lines.entries()) {
    if (current.join('\n').length + line.length > maxChars && current.length) {
      chunks.push({ text: current.join('\n').trim(), startLine, endLine: index })
      current = []
      startLine = index + 1
    }
    current.push(line)
  }
  if (current.length) chunks.push({ text: current.join('\n').trim(), startLine, endLine: lines.length })
  return chunks.filter(chunk => chunk.text)
}

function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i++ }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(value); value = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(value); rows.push(row); row = []; value = ''
    } else value += char
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted cell.')
  if (value || row.length) { row.push(value); rows.push(row) }
  return rows
}

export async function importTextSource(file: File): Promise<Omit<ImportedPaper, 'id' | 'importedAt'> | null> {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const kind = extension === 'md' || extension === 'markdown' ? 'markdown'
    : ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'java', 'go', 'rs', 'c', 'h', 'cpp', 'cs', 'rb', 'php', 'sh', 'sql', 'json', 'yaml', 'yml', 'toml', 'xml'].includes(extension) ? 'code'
      : extension === 'csv' ? 'spreadsheet'
        : ['txt', 'text'].includes(extension) || file.type.startsWith('text/') ? 'text' : null
  if (!kind) return null
  if (file.size > MAX_TEXT) throw new Error('This file is larger than the 1.5 MB text import limit.')
  const text = (await file.text()).replace(/^\uFEFF/, '')
  if (!text.trim()) throw new Error('This file is empty.')
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled material'
  let segments: SourceSegment[]
  if (kind === 'spreadsheet') {
    const rows = parseCsv(text)
    if (rows.length > 20_000 || rows.some(row => row.length > 500)) throw new Error('This CSV exceeds the 20,000 row or 500 column limit.')
    segments = []
    for (let offset = 0; offset < rows.length; offset += 80) {
      const part = rows.slice(offset, offset + 80)
      const colName = (number: number) => { let out = ''; for (; number; number = Math.floor((number - 1) / 26)) out = String.fromCharCode(65 + (number - 1) % 26) + out; return out }
      const endColumn = Math.max(1, ...part.map(row => row.length))
      segments.push({ id: `${file.name}:rows:${offset + 1}-${offset + part.length}`, text: part.map(row => row.map(cell => cell.replace(/\|/g, '\\|')).join(' | ')).join('\n'), locator: { kind: 'spreadsheet-range', sheet: 'CSV', range: `A${offset + 1}:${colName(endColumn)}${offset + part.length}` } })
    }
  } else if (kind === 'markdown') {
    const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)]
    segments = headings.length ? headings.map((heading, index) => {
      const start = heading.index || 0
      const end = headings[index + 1]?.index ?? text.length
      return { id: `${file.name}:section:${index + 1}`, text: text.slice(start, end).trim(), locator: { kind: 'section' as const, heading: heading[1].trim(), anchor: heading[1].trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-') } }
    }) : splitText(text).map((part, index) => ({ id: `${file.name}:section:${index + 1}`, text: part.text, locator: { kind: 'section' as const, startLine: part.startLine, endLine: part.endLine } }))
  } else if (kind === 'code') {
    segments = splitText(text, 160 * 180).map(part => ({ id: `${file.name}:lines:${part.startLine}-${part.endLine}`, text: part.text, locator: { kind: 'code-range' as const, path: file.name, startLine: part.startLine, endLine: part.endLine } }))
  } else {
    segments = splitText(text).map((part, index) => ({ id: `${file.name}:section:${index + 1}`, text: part.text, locator: { kind: 'section' as const, startLine: part.startLine, endLine: part.endLine } }))
  }
  return record(title, file.name, kind, segments)
}

export async function importImageSource(file: File): Promise<Omit<ImportedPaper, 'id' | 'importedAt'> | null> {
  if (!file.type.startsWith('image/')) return null
  if (file.size > 25 * 1024 * 1024) throw new Error('This image exceeds the 25 MB import limit.')
  const { recognizeImage } = await import('./ocr')
  const segments = await recognizeImage(file)
  if (!segments.length) throw new Error('Local OCR did not find readable text in this image.')
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled image'
  const material = record(title, file.name, 'image', segments)
  return { ...material, sourceData: file }
}

export async function importMediaSource(file: File, onProgress: (message: string) => void): Promise<Omit<ImportedPaper, 'id' | 'importedAt'> | null> {
  const kind = file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : null
  if (!kind) return null
  if (file.size > 25 * 1024 * 1024) throw new Error('This media file exceeds the 25 MB import limit.')
  const context = new AudioContext()
  let decoded: AudioBuffer
  try { decoded = await context.decodeAudioData(await file.arrayBuffer()) }
  catch { throw new Error('This media format could not be decoded by the browser. Try an MP3, WAV, M4A, MP4, or WebM file.') }
  finally { await context.close() }
  const duration = decoded.duration
  const chunkSeconds = 30
  if (!Number.isFinite(duration) || duration < 0.1 || duration > 600) throw new Error('Audio and video transcription is limited to 10 minutes per file.')
  const segments: SourceSegment[] = []
  const sourceFrames: Array<{ timeSeconds: number; data: Blob }> = []
  let video: HTMLVideoElement | undefined
  let objectUrl: string | undefined
  if (kind === 'video') {
    video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    objectUrl = URL.createObjectURL(file)
    video.src = objectUrl
    await new Promise<void>((resolve, reject) => {
      video!.onloadedmetadata = () => resolve()
      video!.onerror = () => reject(new Error('This video format could not be opened in the browser.'))
    })
  }
  try {
    for (let start = 0; start < duration; start += chunkSeconds) {
      const end = Math.min(duration, start + chunkSeconds)
      const count = Math.floor((end - start) * 16_000)
      if (count < 1_600) continue
      const pcm = new Float32Array(count)
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel))
      for (let index = 0; index < count; index++) {
        const src = Math.floor((start + index / 16_000) * decoded.sampleRate)
        pcm[index] = channels.reduce((sum, samples) => sum + (samples[src] || 0), 0) / channels.length
      }
      onProgress(`Transcribing ${Math.floor(start)}–${Math.ceil(end)} seconds locally…`)
      const response = await fetch('/api/source/transcribe', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Blob([pcm]) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `Local transcription returned HTTP ${response.status}.`)
      const text = typeof result.text === 'string' ? result.text.trim() : ''
      const frameSeconds = kind === 'video' ? (start + end) / 2 : undefined
      if (kind === 'video' && video) {
        video.currentTime = frameSeconds!
        await new Promise<void>(resolve => { video!.onseeked = () => resolve() })
        const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frame = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
        canvas.width = 0
        canvas.height = 0
        if (frame) sourceFrames.push({ timeSeconds: frameSeconds!, data: frame })
      }
      if (text) segments.push({
        id: `${file.name}:time:${start}-${end}`, text,
        locator: { kind: 'time-range', startSeconds: start, endSeconds: end, ...(frameSeconds === undefined ? {} : { frameSeconds }) },
      })
    }
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
  if (!segments.length) throw new Error('Local Whisper did not find speech in this file.')
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled recording'
  return { ...record(title, file.name, kind, segments), sourceData: file, ...(sourceFrames.length ? { sourceFrames } : {}) }
}
