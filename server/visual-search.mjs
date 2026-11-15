import { createHash } from 'node:crypto'

const commonsFile = url => {
  try {
    const page = new URL(url)
    return page.protocol === 'https:' && page.hostname === 'commons.wikimedia.org' && /^\/wiki\/File:[^/?#]+$/i.test(page.pathname)
      ? decodeURIComponent(page.pathname.slice('/wiki/'.length)).replaceAll('_', ' ')
      : null
  } catch { return null }
}

const plainText = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|amp|quot|#39);/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)

export async function searchLessonImage({ apiKey, query, fetchImpl = fetch }) {
  const search = await fetchImpl('https://api.exa.ai/search', {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ query: `${query} educational diagram illustration Wikimedia Commons`, type: 'auto', numResults: 5, includeDomains: ['commons.wikimedia.org'] }),
  })
  if (!search.ok) throw new Error(`Image search failed (HTTP ${search.status}).`)
  const results = (await search.json()).results || []
  for (const result of results) {
    const file = commonsFile(result?.url)
    if (!file) continue
    const api = new URL('https://commons.wikimedia.org/w/api.php')
    api.search = new URLSearchParams({ action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '960', titles: file, format: 'json', formatversion: '2' }).toString()
    const metadataResponse = await fetchImpl(api, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'Litter-ally/1.0 (lesson visual lookup)' } })
    if (!metadataResponse.ok) continue
    const info = (await metadataResponse.json()).query?.pages?.[0]?.imageinfo?.[0]
    const imageUrl = info?.thumburl || info?.url
    let imageHost
    try { imageHost = new URL(imageUrl) } catch { continue }
    if (imageHost.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(imageHost.hostname)) continue
    const imageResponse = await fetchImpl(imageUrl, { signal: AbortSignal.timeout(20_000) })
    const finalUrl = new URL(imageResponse.url || imageUrl)
    if (!imageResponse.ok || finalUrl.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(finalUrl.hostname)) continue
    const mimeType = imageResponse.headers.get('content-type')?.split(';')[0]
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) || Number(imageResponse.headers.get('content-length') || 0) > 3_000_000) continue
    const bytes = Buffer.from(await imageResponse.arrayBuffer())
    if (!bytes.length || bytes.length > 3_000_000) continue
    const license = plainText(info.extmetadata?.LicenseShortName?.value)
    if (!license) continue
    const licenseUrl = String(info.extmetadata?.LicenseUrl?.value || '')
    const sourceUrl = info.descriptionurl || result.url
    return {
      id: createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16),
      title: plainText(result.title).replace(/^File\s*:\s*/i, '') || file.slice(5),
      sourceUrl, credit: plainText(info.extmetadata?.Artist?.value) || 'Wikimedia Commons contributor',
      license, licenseUrl: /^https:\/\//.test(licenseUrl) ? licenseUrl : '', mimeType, data: bytes.toString('base64'),
    }
  }
  return null
}
