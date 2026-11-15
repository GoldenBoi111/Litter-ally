Product direction and requirements: [AI Learning Canvas specification](product-specification.md) and [product requirements](product-requirements.md). This guide documents the current hybrid voice implementation and its operational limits; it is not a statement that every product capability is implemented.

# Hybrid voice setup

Production builds copy the Silero model, audio worklet, and ONNX Runtime WebAssembly files into `dist/voice-assets`. Publish the Vite `dist` directory and route `/api` to the app server. The app server handles GPT-6 Responses, tool orchestration, and an authenticated same-origin WebSocket at `/api/voice/socket`; a separate persistent voice host runs faster-whisper and Qwen. The browser streams 16 kHz mono Float32 PCM to the app server while the learner speaks. It forwards each finished utterance to local transcription and streams Qwen PCM back over the same WebSocket. The Vite dev proxy forwards WebSocket upgrades, so a Cloudflare Tunnel can point at the Vite port (normally 5185).

The voice path uses browser Silero VAD (`@ricky0123/vad-web`), local NVIDIA Parakeet TDT 0.6B v2 speech-to-text (int8 ONNX on CPU via `onnx-asr`; set `LOCAL_STT_PROVIDER=faster_whisper` to use Whisper `base.en` instead), streamed OpenAI Responses API calls (`gpt-6-luna`, medium reasoning), and Qwen3-TTS CustomVoice Q8_0/Aiden served by audio.cpp v0.9.4/CUDA. The Node server keeps the OpenAI API key. VAD interrupts playback and cancels local Qwen generation; the voice host returns a transcript, which the app server sends to Responses. Qwen starts as soon as the first speakable phrase arrives.

## Install and run on Windows

From the repository root in PowerShell:

```powershell
npm install
./scripts/setup-voice.ps1
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Set `OPENAI_API_KEY` in `.env`, then launch both the persistent Qwen service and the existing app:

```powershell
npm run app:local
```

The service loads Qwen once at `127.0.0.1:8187`; the speech host loads Whisper once at `127.0.0.1:8190`. The app tries `http://127.0.0.1:5185`; Vite chooses the next open port when that one is occupied. The API chooses an available port starting at `5186`. Press Ctrl+C to stop the app and its managed voice services. To manage models separately, use `npm run voice:start` and `npm run voice:stop`, then launch `npm run dev`.

`setup-voice.ps1` verifies audio.cpp v0.9.4 and reuses the benchmark's CUDA binary, runtime DLLs, Qwen weights, and faster-whisper environment when present. Missing audio.cpp and Qwen artifacts are downloaded from the pinned v0.9.4/runtime and model revisions with SHA-256 checks. If no existing faster-whisper environment is usable, the script creates `tts-benchmark/runtime/asr`, installs faster-whisper 1.2.1, and warms the `base.en` model. First-time setup needs internet access.

## Configuration

The defaults are in `.env.example`. Main switches:

```dotenv
OPENAI_TEXT_MODEL=gpt-6-luna
LOCAL_STT_PROVIDER=parakeet
LOCAL_STT_MODEL=nemo-parakeet-tdt-0.6b-v2
LOCAL_VAD_PROVIDER=silero
LOCAL_TTS_PROVIDER=audiocpp
LOCAL_TTS_URL=http://127.0.0.1:8187
LOCAL_TTS_MODEL=qwen3-custom
LOCAL_TTS_VOICE=Aiden
VOICE_RTC_URL=http://127.0.0.1:8190
VOICE_RTC_BIND=127.0.0.1
VOICE_RTC_ALLOWED_ORIGINS=http://127.0.0.1:5185,http://localhost:5185
VOICE_STREAMING=true
VOICE_BARGE_IN=true
```

The WebSocket requires a signed-in app session and a same-origin `Origin` header. Keep the Node API private behind the app's HTTPS tunnel, and do not expose the loopback voice host directly. A shared remote app still needs authentication, rate limits and storage suitable for its host. Cloudflare terminates HTTPS before forwarding the WebSocket to your local app, so microphone audio passes through Cloudflare and your tunnel. WebSocket over TCP avoids ICE/TURN setup but can stall briefly when packets are lost; it also streams raw audio at roughly 512 kbit/s. Keep diagnostic endpoints disabled on a networked host.

There is no Vercel adapter in this repo. A production setup must separately provide authenticated API hosting and an upload/storage path that fits that host's request limits. The local-loopback voice design assumes the learner runs Whisper/Qwen on their own device; a shared remote voice machine needs authenticated WSS, rate limits and capacity controls. Do not treat the static Vite build as a complete deployment.

## Voice flow and controls

Silero's local VAD keeps echo cancellation, noise suppression, and automatic gain control enabled. The browser streams 16 kHz mono Float32 PCM over the authenticated WebSocket. VAD sends `speech.start` / `speech.end` control markers; the app server keeps a short pre-roll ring and bounded segment buffer before forwarding the utterance to local transcription. Turn IDs discard stale transcripts. The app's Responses API stream stays on the app server; the browser runs tools and returns their results. Speakable phrases stream Qwen PCM chunks back over the same WebSocket and the existing AudioContext player schedules them. Muting disables the microphone track and cancels any unfinished segment while leaving tutor playback available.

The browser streams Qwen PCM chunks into an audio buffer. AEC is the primary playback echo control while the Silero VAD remains active so the learner can interrupt. Microphone input requires a secure context (`localhost` is supported) and browser permission.

## Live teaching beats

Planned instruction now uses `present_teaching_beat` instead of generating a whole drawing script. Each strict tool call contains one short spoken explanation, a stable beat id, context, a bounded pause, and up to twelve timed canvas actions. The client starts that beat's Qwen speech and tldraw animation together. It may prefetch the next beat while the current one is presented, but holds at most two queued beats and forces a learner-paced stop after three automatic beats.

Pen strokes are native tldraw `draw` shapes whose compressed segments grow every animation frame. Equations and precise labels use editable tldraw text with the draw font. Every tutor shape records its lesson, checkpoint, beat, action, origin, execution state, and progress in metadata. Retrying the same stable action resumes its partial shape; completed actions are skipped. Revision actions can delete only shapes tagged as tutor-owned for the current lesson. Student shapes and partially drawn ink remain when VAD, pause, page hiding, or stop aborts the current generation.

Spoken and drawing completion are tracked separately. If the learner interrupts, the next model turn receives the interrupted beat's speech completion plus current action progress, so it can rephrase cut-off narration without redrawing completed work. The most recent unowned freehand mark, arrow, or highlight can serve as structured reference context when there is no explicit selection. A targeted canvas crop is still attached for visual interpretation when the learner uses **Ask about selection**.

The browser records `beatTransitionMs` in `paper-board.voiceMetrics` alongside the existing voice metrics. This measures the observed gap between completed queued beats, including an intentional `pauseMs` when present.

## Conversational voice style

The tutor separates content writing from acoustic delivery. Responses API writes short, speakable sentences with contractions, varied sentence length, and punctuation that gives Qwen useful breath and emphasis boundaries. It expresses curiosity, encouragement, or gentle correction through the wording instead of emitting stage directions or emotion tags.

Qwen receives one natural-language style control through audio.cpp's model-specific `options.instruct` field. The instruction asks Aiden to match emotion to the meaning while keeping connected phrasing and restrained pauses. This is supported by the installed Qwen3-TTS 1.7B CustomVoice model; the sampling temperature, top-k, top-p, and repetition penalty stay at audio.cpp's model defaults. The server uses growing stream chunks, which already starts with one codec frame for low first-audio latency.

The Node app server and local voice host receive raw microphone audio; OpenAI only receives the transcript and relevant lesson context. The API key remains server-side and never reaches the browser.

## Benchmarks

Run the full warmed component/system probe while the app and Qwen service are running:

```powershell
$env:VOICE_BENCH_RUNS = '7'
npm run voice:benchmark:local
npm run voice:benchmark
```

The first command measures local STT and Qwen first-audio latency using the existing teacher WAV as its speech fixture. The second adds Responses API time-to-first-text, time-to-first-speakable-phrase, and pipeline time-to-first-audio; it requires a valid API key and incurs API usage. Sample count can be set from 3 to 20. Set `VOICE_RTC_URL` to the voice host and `PAPER_BOARD_API_URL` to the app API if they differ from their local defaults. The browser also stores live VAD endpoint, local STT, Responses API, TTS, speech-to-audio, interruption-to-silence, and underrun samples in `localStorage` under `paper-board.voiceMetrics`.

Historical baseline (2026-11-10, before the live WebRTC path): three runs through the previous local Node proxy produced the measurements below. STT used the 69-second synthesized passage, not a short conversational utterance. The first Qwen result includes remaining warm-up; later requests are warm.

| Measurement | p50 | p90 | p95 | Runs |
|---|---:|---:|---:|---:|
| Local STT for 69-second WAV | 5,578 ms | 5,714 ms | 5,714 ms | 3 |
| Qwen time to first audio | 421 ms | 1,590 ms | 1,590 ms | 3 |

The Qwen server reported `loaded: true`; after the probes, `nvidia-smi` showed 3,799 MiB used of 8,188 MiB. The existing longer-run benchmark measured a 5,052 MiB total-GPU peak. The configured OpenAI API key returned “invalidated” during the GPT probe, so integrated speech-to-speech latency and GPT percentiles could not be measured here. No live microphone run was available, so VAD endpoint, interruption-to-silence, and audio underruns remain unmeasured. Those live values are recorded by the browser for a user session. The existing benchmark's Qwen stream probe measured 1,493.83 ms to first PCM; these results reinforce that the under-1.5-second end-to-end goal is not currently met reliably.
