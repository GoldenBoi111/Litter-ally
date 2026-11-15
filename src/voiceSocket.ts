export async function openVoiceSocket(stream: MediaStream, onMessage: (data: string | ArrayBuffer) => void) {
  const context = new AudioContext({ sampleRate: 16_000 })
  if (context.sampleRate !== 16_000) { await context.close(); throw new Error('This browser cannot capture voice at the required sample rate.') }
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/voice/socket`)
  socket.binaryType = 'arraybuffer'
  socket.onmessage = event => onMessage(event.data)
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Timed out connecting to the voice service.')), 15_000)
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Could not connect to the voice service.')) }, { once: true })
      socket.addEventListener('close', () => { clearTimeout(timeout); reject(new Error('The voice service closed the connection.')) }, { once: true })
    })
    await context.audioWorklet.addModule(import.meta.env.DEV ? '/src/voice-pcm-worklet.js' : `${import.meta.env.BASE_URL}voice-assets/voice-pcm-worklet.js`)
    const source = context.createMediaStreamSource(stream)
    const worklet = new AudioWorkletNode(context, 'voice-pcm')
    const silent = context.createGain()
    silent.gain.value = 0
    worklet.port.onmessage = event => {
      if (socket.readyState === WebSocket.OPEN) {
        if (socket.bufferedAmount > 128_000) socket.close(1013, 'Voice upload is too slow')
        else socket.send(event.data)
      }
    }
    source.connect(worklet).connect(silent).connect(context.destination)
    await context.resume()
    if (socket.readyState !== WebSocket.OPEN) throw new Error('The voice service closed the connection.')
    return {
      socket,
      close() { socket.close(); worklet.port.close(); void context.close() },
    }
  } catch (error) {
    socket.close()
    await context.close()
    throw error
  }
}
