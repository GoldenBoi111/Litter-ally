import { defineConfig, loadEnv } from 'vite'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const voiceAssets = [
  ['@ricky0123/vad-web/dist/silero_vad_v5.onnx', 'voice-assets/vad/silero_vad_v5.onnx'],
  ['@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', 'voice-assets/vad/vad.worklet.bundle.min.js'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'voice-assets/ort/ort-wasm-simd-threaded.mjs'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'voice-assets/ort/ort-wasm-simd-threaded.wasm'],
]

function deployVoiceAssets() {
  let root: string
  let outDir: string
  return {
    name: 'deploy-voice-assets',
    apply: 'build' as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      root = config.root
      outDir = resolve(root, config.build.outDir)
    },
    async closeBundle() {
      await Promise.all(voiceAssets.map(async ([source, target]) => {
        const destination = resolve(outDir, target)
        await mkdir(dirname(destination), { recursive: true })
        await copyFile(resolve(root, 'node_modules', source), destination)
      }))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), deployVoiceAssets()],
    resolve: { alias: { '@': resolve(process.cwd(), 'src') } },
    server: {
      proxy: { '/api': process.env.PAPER_BOARD_API_URL || env.PAPER_BOARD_API_URL || 'http://127.0.0.1:5186' },
    },
  }
})
