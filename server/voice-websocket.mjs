import { WebSocket, WebSocketServer } from 'ws'

const MAX_AUDIO_BYTES = 16_000 * 30 * 4
const MAX_CHUNK_BYTES = 2_560
const RING_CHUNKS = 30

export function attachVoiceWebSocket(server, { authenticate, voiceUrl }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8_192 })
  server.on('upgrade', async (req, socket, head) => {
    let url
    try { url = new URL(req.url, 'http://localhost') } catch { socket.destroy(); return }
    if (url.pathname !== '/api/voice/socket') { socket.destroy(); return }
    let origin
    try { origin = new URL(req.headers.origin) } catch {}
    if (!origin || !['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    try {
      if (!await authenticate(req)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req))
    } catch {
      socket.destroy()
    }
  })

  wss.on('connection', ws => {
    const ring = []
    let segment = null
    let samples = 0
    let turn = 0
    let ttsController = null

    const send = value => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value)) }
    const clearSegment = () => { segment = null; samples = 0 }
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const audio = Buffer.from(data)
        if (!audio.length || audio.length > MAX_CHUNK_BYTES || audio.length % 4) return ws.close(1003, 'Invalid PCM frame')
        for (let i = 0; i < audio.length; i += 4) if (!Number.isFinite(audio.readFloatLE(i))) return ws.close(1003, 'Invalid PCM sample')
        ring.push(audio)
        if (ring.length > RING_CHUNKS) ring.shift()
        if (segment) {
          samples += audio.length / 4
          if (samples > MAX_AUDIO_BYTES / 4) {
            const endedTurn = turn
            clearSegment()
            send({ type: 'error', turn: endedTurn, error: 'Speech recording reached the 30 second limit.' })
          } else segment.push(audio)
        }
        return
      }
      const control = Buffer.isBuffer(data) ? data.toString() : String(data)
      if (Buffer.byteLength(control) > 4_000) return ws.close(1009, 'Control message too large')
      let message
      try { message = JSON.parse(control) } catch { send({ type: 'error', error: 'Invalid voice control message.' }); return }
      if (message.type === 'speech.start' && Number.isSafeInteger(message.turn) && message.turn >= 0) {
        turn = message.turn
        segment = [...ring]
        samples = segment.reduce((count, part) => count + part.length / 4, 0)
      } else if (message.type === 'speech.end' && segment) {
        const parts = segment
        const endedTurn = turn
        clearSegment()
        if (message.ignoreResult) { send({ type: 'transcript', text: '', turn: endedTurn, latencyMs: 0 }); return }
        const audio = Buffer.concat(parts)
        if (audio.length < 6_400 || audio.length > MAX_AUDIO_BYTES) { send({ type: 'error', turn: endedTurn, error: 'Speech must be between 0.1 and 30 seconds.' }); return }
        void fetch(`${voiceUrl}/source-transcribe`, {
          method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-voice-prompt': String(message.prompt || '').slice(0, 2_000) },
          body: audio, signal: AbortSignal.timeout(120_000),
        }).then(async response => {
          const result = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(result.error || 'Local transcription failed.')
          send({ type: 'transcript', text: result.text || '', latencyMs: result.latencyMs || 0, turn: endedTurn })
        }).catch(error => send({ type: 'error', turn: endedTurn, error: String(error.message || 'Local transcription failed.').slice(0, 300) }))
      } else if (message.type === 'speak' && typeof message.text === 'string' && message.text.trim().length >= 1 && message.text.trim().length <= 900 && /^\d{1,10}$/.test(message.id || '') && Number(message.id) <= 4_294_967_295) {
        if (ttsController) { send({ type: 'error', id: message.id, error: 'Speech is already being generated.' }); return }
        const controller = new AbortController()
        ttsController = controller
        void streamSpeech(ws, message.id, message.text.trim(), controller.signal).finally(() => { if (ttsController === controller) ttsController = null })
      } else if (message.type === 'cancel') {
        clearSegment()
        ttsController?.abort()
        ttsController = null
        send({ type: 'cancelled' })
      } else if (message.type === 'speech.cancel') {
        clearSegment()
      } else send({ type: 'error', error: 'Unknown voice control message.' })
    })
    ws.on('close', () => { ttsController?.abort(); clearSegment() })
    ws.on('error', () => { ttsController?.abort(); clearSegment() })
  })
}

async function streamSpeech(ws, id, text, signal) {
  try {
    const base = (process.env.LOCAL_TTS_URL?.trim() || 'http://127.0.0.1:8187').replace(/\/$/, '')
    const response = await fetch(`${base}/v1/audio/speech`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ model: process.env.LOCAL_TTS_MODEL?.trim() || 'qwen3-custom', voice: process.env.LOCAL_TTS_VOICE?.trim() || 'Aiden', input: text, stream_format: 'sse', options: { instruct: 'Speak in a warm, engaged, conversational teaching voice. Match emotion to meaning, use natural pitch variation and connected phrasing, and avoid theatrical or sing-song delivery.' } }),
    })
    if (!response.ok || !response.body) throw new Error(`Local speech service returned HTTP ${response.status}.`)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    const frame = async event => {
      const line = event.split(/\r?\n/).find(value => value.startsWith('data: '))?.slice(6)
      if (!line || line === '[DONE]') return
      const data = JSON.parse(line)
      if (data.type === 'error') throw new Error(data.error || 'Local speech failed.')
      if (data.type !== 'speech.audio.delta' || typeof data.audio !== 'string') return
      const pcm = Buffer.from(data.audio, 'base64')
      for (let offset = 0; offset + 1 < pcm.length; offset += 12_000) {
        if (signal.aborted || ws.readyState !== WebSocket.OPEN) return
        while (ws.bufferedAmount > 256_000 && ws.readyState === WebSocket.OPEN && !signal.aborted) await new Promise(resolve => setTimeout(resolve, 10))
        const part = pcm.subarray(offset, Math.min(offset + 12_000, pcm.length - ((pcm.length - offset) % 2)))
        if (!part.length) continue
        const packet = Buffer.allocUnsafe(4 + part.length)
        packet.writeUInt32BE(Number(id), 0)
        part.copy(packet, 4)
        ws.send(packet)
      }
    }
    while (true) {
      const { value, done } = await reader.read()
      pending += decoder.decode(value || new Uint8Array(), { stream: !done })
      const events = pending.split(/\r?\n\r?\n/)
      pending = events.pop() || ''
      for (const event of events) await frame(event)
      if (done) break
    }
    if (pending) await frame(pending)
    if (!signal.aborted && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'speech.done', id }))
  } catch (error) {
    if (!signal.aborted && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', id, error: String(error.message || 'Local speech failed.').slice(0, 300) }))
  }
}
