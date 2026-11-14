import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const base = process.env.VOICE_RTC_URL || 'http://127.0.0.1:8190'
const runs = Math.max(3, Math.min(20, Number(process.env.VOICE_BENCH_RUNS || 7)))
const wav = await readFile(new URL('../tts-benchmark/outputs/qwen_teacher.wav', import.meta.url))

function asrPayload(buffer) {
  let offset = 12
  let rate = 0
  let channels = 0
  let data
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString('ascii', offset, offset + 4)
    const length = buffer.readUInt32LE(offset + 4)
    if (chunk === 'fmt ') { channels = buffer.readUInt16LE(offset + 10); rate = buffer.readUInt32LE(offset + 12) }
    if (chunk === 'data') { data = buffer.subarray(offset + 8, offset + 8 + length); break }
    offset += 8 + length + (length & 1)
  }
  if (!data || channels !== 1 || !rate) throw new Error('Use a mono PCM WAV fixture.')
  const pcm = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
  const float = new Float32Array(Math.floor(pcm.length * 16000 / rate))
  for (let i = 0; i < float.length; i += 1) float[i] = pcm[Math.floor(i * rate / 16000)] / 32768
  return Buffer.from(float.buffer)
}

function percentile(values, fraction) {
  return [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)]
}

async function firstSseAudio(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  while (true) {
    const { done, value } = await reader.read()
    pending += decoder.decode(value, { stream: !done })
    const blocks = pending.split('\n\n')
    pending = blocks.pop() || ''
    for (const block of blocks) {
      const line = block.split('\n').find(item => item.startsWith('data: '))
      if (line && JSON.parse(line.slice(6)).type === 'speech.audio.delta') {
        await reader.cancel()
        return
      }
    }
    if (done) return
  }
}

const audio = asrPayload(wav)
const stt = []
const tts = []
let transcript = ''
for (let run = 0; run < runs; run += 1) {
  let started = performance.now()
  let response = await fetch(`${base}/transcribe`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-voice-prompt': 'Research%20paper%20explanation%3A%20neural%20network%20backpropagation%20and%20attention.' },
    body: audio,
  })
  let result = await response.json()
  if (!response.ok) throw new Error(result.error || `STT returned ${response.status}.`)
  stt.push(performance.now() - started)
  transcript = result.text

  started = performance.now()
  response = await fetch(`${base}/speech`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Attention lets the model focus on the parts of the input that matter for this prediction.' }),
  })
  if (!response.ok) throw new Error((await response.json()).error || `TTS returned ${response.status}.`)
  await firstSseAudio(response)
  tts.push(performance.now() - started)
  process.stdout.write(`Run ${run + 1}/${runs}: STT ${Math.round(stt.at(-1))} ms; TTS first audio ${Math.round(tts.at(-1))} ms\n`)
}

const summary = values => ({ p50: Math.round(percentile(values, 0.5)), p90: Math.round(percentile(values, 0.9)), p95: Math.round(percentile(values, 0.95)) })
console.log(JSON.stringify({ runs, fixture: 'locally synthesized Qwen teacher WAV (not a live user recording)', transcript, localSttMs: summary(stt), qwenTimeToFirstAudioMs: summary(tts) }, null, 2))
