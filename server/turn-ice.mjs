import { createHmac } from 'node:crypto'

export function turnIceServer(url, secret, now = Date.now()) {
  if (!url || !secret) return null
  const username = `${Math.floor(now / 1000) + 3600}:litterally`
  const credential = createHmac('sha1', secret).update(username).digest('base64')
  return { urls: url, username, credential }
}
