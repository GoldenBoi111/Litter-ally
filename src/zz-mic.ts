// TEMPORARY mic check - delete after use.
const out = document.getElementById('out')!
const log = (m: string) => { out.textContent += '\n' + m }
try {
  await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'voice-e2e-test@example.test', password: 'voice-e2e-test-pass' }) })
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
  const ctx = new AudioContext({ sampleRate: 16000 })
  const src = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser(); analyser.fftSize = 2048; src.connect(analyser)
  const buf = new Float32Array(analyser.fftSize); let peak = 0
  const timer = setInterval(() => { analyser.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v)) }, 50)
  const rec = new MediaRecorder(stream); const chunks: Blob[] = []
  rec.ondataavailable = e => chunks.push(e.data); rec.start()
  await new Promise(r => setTimeout(r, 8500)); rec.stop(); await new Promise(r => rec.onstop = r); clearInterval(timer)
  log(`peak amplitude: ${peak.toFixed(3)} (settings: ${JSON.stringify(stream.getAudioTracks()[0].getSettings()).slice(0, 160)})`)
  const audio = await ctx.decodeAudioData(await new Blob(chunks, { type: rec.mimeType }).arrayBuffer())
  const pcm = audio.getChannelData(0).slice(0, 28 * 16000)
  const r = await fetch('/api/source/transcribe', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Blob([pcm]) })
  log(`transcribe HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
} catch (e: any) { log('FAIL ' + e?.message) }
log('DONE')
