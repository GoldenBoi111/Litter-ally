import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const base = process.env.PAPER_BOARD_API_URL || 'http://127.0.0.1:5186'
const voiceBase = process.env.VOICE_RTC_URL || 'http://127.0.0.1:8190'
const runs = Math.max(3, Math.min(20, Number(process.env.VOICE_BENCH_RUNS || 7)))
const wavPath = new URL('../tts-benchmark/outputs/qwen_teacher.wav', import.meta.url)

function wavAsFloat32(buffer) {
  let offset = 12
  let rate = 0
  let channels = 0
  let data
  while (offset + 8 < buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const length = buffer.readUInt32LE(offset + 4)
    if (id === 'fmt ') { channels = buffer.readUInt16LE(offset + 10); rate = buffer.readUInt32LE(offset + 12) }
    if (id === 'data') { data = buffer.subarray(offset + 8, offset + 8 + length); break }
    offset += 8 + length + (length & 1)
  }
  if (!data || !rate || channels !== 1) throw new Error('The benchmark fixture must be mono PCM WAV.')
  const samples = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
  const outLength = Math.floor(samples.length * 16000 / rate)
  const out = new Float32Array(outLength)
  for (let i = 0; i < out.length; i += 1) out[i] = samples[Math.floor(i * rate / 16000)] / 32768
  return Buffer.from(out.buffer)
}

async function sseEvents(response, onEvent) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  while (true) {
    const { done, value } = await reader.read()
    pending += decoder.decode(value, { stream: !done })
    const blocks = pending.split('\n\n')
    pending = blocks.pop() || ''
    for (const block of blocks) {
      const line = block.split('\n').find(value => value.startsWith('data: '))
      if (line && line.slice(6) !== '[DONE]') await onEvent(JSON.parse(line.slice(6)))
    }
    if (done) break
  }
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)]
}

function report(name, values) {
  return { name, runs: values.length, p50: Math.round(percentile(values, 0.5)), p90: Math.round(percentile(values, 0.9)), p95: Math.round(percentile(values, 0.95)) }
}

const audio = wavAsFloat32(await readFile(wavPath))
const measurements = { stt: [], gptFirstText: [], gptFirstPhrase: [], ttsFirstAudio: [], pipelineFirstAudio: [] }
const output = []
for (let index = 0; index < runs; index += 1) {
  const started = performance.now()
  const sttStarted = performance.now()
  const sttResponse = await fetch(`${voiceBase}/transcribe`, {
    method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-voice-prompt': 'Research%20paper%20lecture.%20Explain%20neural%20network%20backpropagation%20and%20attention%20mechanisms.' },
    body: audio,
  })
  const transcript = await sttResponse.json()
  if (!sttResponse.ok) throw new Error(transcript.error || `STT failed (${sttResponse.status}).`)
  measurements.stt.push(performance.now() - sttStarted)

  const gptStarted = performance.now()
  const gptResponse = await fetch(`${base}/api/voice/respond`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Voice benchmark teaching passage', brief: 'Explain this passage clearly, conversationally, and accurately. Keep the first answer to two speakable sentences.', input: [{ type: 'message', role: 'user', content: transcript.text || 'Explain why attention is useful in a neural network.' }] }),
  })
  if (!gptResponse.ok) {
    const error = await gptResponse.json()
    throw new Error(error.error || `GPT failed (${gptResponse.status}).`)
  }
  let text = ''
  let firstPhrase = ''
  let sawText = false
  await sseEvents(gptResponse, event => {
    if (event.type !== 'text' || typeof event.text !== 'string') return
    text += event.text
    if (!sawText) { sawText = true; measurements.gptFirstText.push(performance.now() - gptStarted) }
    if (!firstPhrase && /[.!?](?:[”’"')\]]*)\s/.test(text)) {
      firstPhrase = text.slice(0, text.search(/[.!?](?:[”’"')\]]*)\s/) + 1).trim()
      measurements.gptFirstPhrase.push(performance.now() - gptStarted)
    }
  })
  firstPhrase ||= text.trim()
  if (!firstPhrase) throw new Error('GPT returned no speakable text.')

  const ttsStarted = performance.now()
  const ttsResponse = await fetch(`${voiceBase}/speech`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: firstPhrase }),
  })
  if (!ttsResponse.ok) {
    const error = await ttsResponse.json()
    throw new Error(error.error || `TTS failed (${ttsResponse.status}).`)
  }
  let sawAudio = false
  await sseEvents(ttsResponse, event => {
    if (event.type === 'speech.audio.delta' && !sawAudio) {
      sawAudio = true
      measurements.ttsFirstAudio.push(performance.now() - ttsStarted)
      measurements.pipelineFirstAudio.push(performance.now() - started)
    }
  })
  output.push({ run: index + 1, transcript: transcript.text, phrase: firstPhrase })
  process.stdout.write(`Warmed run ${index + 1}/${runs}: first audio ${Math.round(measurements.pipelineFirstAudio.at(-1))} ms\n`)
}

const vram = await new Promise(resolve => {
  const child = spawn('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'])
  let result = ''
  child.stdout.on('data', chunk => result += chunk)
  child.on('close', code => resolve(code === 0 ? result.trim().split(',').map(value => Number(value.trim())) : null))
})
console.log(JSON.stringify({ hardwareVramMiB: vram, summary: [
  report('localSttMs', measurements.stt), report('gptTimeToFirstTextMs', measurements.gptFirstText),
  report('gptTimeToFirstSpeakablePhraseMs', measurements.gptFirstPhrase), report('ttsTimeToFirstAudioMs', measurements.ttsFirstAudio),
  report('speechPipelineToFirstAudioMs', measurements.pipelineFirstAudio),
], limitation: 'VAD endpoint, interruption silence, and audio underruns require a live microphone/browser session; use localStorage paper-board.voiceMetrics for those measurements.' }, null, 2))
