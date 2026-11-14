import { inflateRawSync } from 'node:zlib'

const MAX_EXTRACTED_BYTES = 1_500_000
const MAX_MEDIA_BYTES = 8_000_000
const MAX_ARCHIVE_ENTRIES = 2_000

function zipEntries(buffer) {
  let end = -1
  for (let offset = Math.max(0, buffer.length - 65_557); offset <= buffer.length - 22; offset++) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) end = offset
  }
  if (end < 0) throw new Error('This office file is not a supported ZIP archive.')
  const count = buffer.readUInt16LE(end + 10)
  const directorySize = buffer.readUInt32LE(end + 12)
  let offset = buffer.readUInt32LE(end + 16)
  if (count > MAX_ARCHIVE_ENTRIES || offset + directorySize > end) throw new Error('This office file has an invalid or oversized directory.')
  const entries = new Map()
  let extractedBytes = 0
  let mediaBytes = 0
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('This office file has a damaged directory.')
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + extraLength + commentLength
    if (flags & 1) throw new Error('Password-protected office files are not supported.')
    if (!/^(?:xl|ppt)\//.test(name) || name.endsWith('/')) continue
    const media = /^ppt\/media\//.test(name)
    if (![0, 8].includes(method) || uncompressedSize > (media ? MAX_MEDIA_BYTES : MAX_EXTRACTED_BYTES)) throw new Error('This office file uses an unsupported or oversized compression method.')
    if (media) mediaBytes += uncompressedSize
    else extractedBytes += uncompressedSize
    if (mediaBytes > MAX_MEDIA_BYTES) throw new Error('PowerPoint images exceed the 8 MB extraction limit.')
    if (extractedBytes > MAX_EXTRACTED_BYTES) throw new Error('Office text exceeds the 1.5 MB extraction limit.')
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('This office file has a damaged entry.')
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const compressed = buffer.subarray(start, start + compressedSize)
    const data = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: media ? MAX_MEDIA_BYTES : MAX_EXTRACTED_BYTES })
    if (data.length !== uncompressedSize) throw new Error('This office file contains an inconsistent entry size.')
    entries.set(name, media ? data : data.toString('utf8'))
  }
  return entries
}

function resolveZipTarget(base, target) {
  const parts = `${base}/${target}`.split('/')
  const resolved = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}

export function extractPowerPointSlideImage(buffer, fileName, slideNumber) {
  if (!/^pptx$/i.test(fileName.split('.').pop() || '') || !Number.isInteger(slideNumber) || slideNumber < 1 || slideNumber > 300) return null
  const entries = zipEntries(buffer)
  const slidePath = `ppt/slides/slide${slideNumber}.xml`
  const slide = entries.get(slidePath)
  if (!slide) return null
  const relationships = entries.get(`ppt/slides/_rels/slide${slideNumber}.xml.rels`) || ''
  const targets = new Map([...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].flatMap(match => {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1]
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1]
    return id && target ? [[id, resolveZipTarget('ppt/slides', target)]] : []
  }))
  const mediaPath = [...slide.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)]
    .map(match => targets.get(match[1])).find(path => path && /^ppt\/media\//.test(path) && entries.get(path))
  const data = mediaPath ? entries.get(mediaPath) : null
  if (!Buffer.isBuffer(data)) return null
  const mimeType = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })[mediaPath.split('.').pop()?.toLowerCase() || '']
  return mimeType ? { mimeType, data: data.toString('base64') } : null
}

function xmlText(value) {
  return value.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim()
}

function pptxSegments(entries, fileName) {
  const slides = [...entries.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]))
  if (!slides.length || slides.length > 300) throw new Error('This presentation must contain between 1 and 300 readable slides.')
  return slides.map((name, index) => {
    const texts = [...entries.get(name).matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(match => xmlText(match[1])).filter(Boolean)
    const notes = entries.get(`ppt/notesSlides/notesSlide${index + 1}.xml`)
    const noteText = notes ? [...notes.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(match => xmlText(match[1])).filter(Boolean) : []
    return { id: `${fileName}:slide:${index + 1}`, text: [...texts, ...(noteText.length ? [`Speaker notes: ${noteText.join(' ')}`] : [])].join('\n'), locator: { kind: 'slide', slide: index + 1 } }
  })
}

function xlsxSegments(entries, fileName) {
  const sharedXml = entries.get('xl/sharedStrings.xml') || ''
  const shared = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match => [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(item => xmlText(item[1])).join(''))
  const workbook = entries.get('xl/workbook.xml') || ''
  const names = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"/g)].map(match => xmlText(match[1]))
  const sheets = [...entries.keys()].filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/sheet(\d+)/)[1]) - Number(b.match(/sheet(\d+)/)[1]))
  if (!sheets.length) throw new Error('This workbook has no readable worksheets.')
  const segments = []
  for (const [sheetIndex, name] of sheets.entries()) {
    const xml = entries.get(name)
    const rows = [...xml.matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)]
    for (let start = 0; start < rows.length; start += 80) {
      const selected = rows.slice(start, start + 80)
      const rendered = selected.map(row => {
        const cells = [...row[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(cell => {
          const ref = cell[1].match(/\br="([A-Z]+\d+)"/)?.[1] || ''
          const type = cell[1].match(/\bt="([^"]+)"/)?.[1]
          const formula = cell[2].match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1]
          const value = cell[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1]
          const inline = cell[2].match(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/)?.[1]
          const raw = type === 's' && value !== undefined ? shared[Number(value)] || '' : inline || value || ''
          return `${ref}=${xmlText(raw)}${formula ? ` (=${xmlText(formula)})` : ''}`
        })
        return cells.join(' | ')
      }).filter(Boolean)
      const firstRow = Number(selected[0][1])
      const lastRow = Number(selected.at(-1)[1])
      const lastColumn = [...selected.at(-1)[2].matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"/g)].at(-1)?.[1] || 'A'
      const sheet = names[sheetIndex] || `Sheet ${sheetIndex + 1}`
      segments.push({ id: `${fileName}:${sheet}:${firstRow}-${lastRow}`, text: rendered.join('\n'), locator: { kind: 'spreadsheet-range', sheet, range: `A${firstRow}:${lastColumn}${lastRow}` } })
    }
  }
  if (segments.length > 300) throw new Error('This workbook exceeds the 300-section limit.')
  return segments
}

export function extractOfficeSource(buffer, fileName) {
  const entries = zipEntries(buffer)
  const extension = fileName.split('.').pop()?.toLowerCase()
  const kind = extension === 'pptx' ? 'slides' : extension === 'xlsx' ? 'spreadsheet' : null
  if (!kind) throw new Error('Only PowerPoint (.pptx) and Excel (.xlsx) office files are supported.')
  const segments = kind === 'slides' ? pptxSegments(entries, fileName) : xlsxSegments(entries, fileName)
  if (!segments.some(segment => segment.text.trim())) throw new Error('No readable text was found in this office file.')
  const title = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
  const text = segments.map((segment, index) => `[Page ${index + 1} of ${segments.length}]\n${segment.text}`).join('\n\n')
  return { title, sourceUrl: '', pdfUrl: '', fileName, sourceKind: kind, sourceSegments: segments, pageCount: segments.length, characterCount: text.length, text }
}
