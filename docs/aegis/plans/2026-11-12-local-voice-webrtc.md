# Local Voice over WebRTC

> Historical implementation plan. Its architecture and verification notes record the voice migration, not the full product requirements. See [current product requirements](../../product-requirements.md) and the [canonical product specification](../../product-specification.md).

## Goal

Move microphone audio and local Qwen speech away from the hosted Node app. The browser sends its microphone as a WebRTC audio track to a persistent local speech host, where browser VAD markers segment audio for faster-whisper. Qwen speech returns over the same peer connection. The existing Node `/api/voice/respond` Responses API endpoint remains responsible for GPT-6 tutoring and tool calls.

## Architecture

- Browser: retains Silero VAD, interruption/mute behavior, transcript UI, GPT tool dispatch, and AudioContext playback.
- Persistent Python host: owns WebRTC signaling/media sessions, bounded audio buffering, faster-whisper, and Qwen SSE. It is separate from Vercel Functions so a voice session does not depend on a finite HTTP invocation.
- Node app: provides public voice settings and the existing GPT-6 Responses stream. It no longer receives audio or proxies local Qwen output.
- Audio lifecycle: `speech.start` and `speech.end` DataChannel messages mark boundaries on a WebRTC microphone track; the host keeps a short pre-roll ring, caps utterance duration, transcribes on end, and sends transcript/error control messages. `speak` asks Qwen for a response; binary PCM chunks travel on the DataChannel and use the current browser PCM scheduler. `cancel` aborts Qwen and discards pending output.

## Baseline and Authority Refs

- `src/hybridTutor.ts`: current mic capture, VAD events, HTTP transcription, GPT response/tool loop, Qwen HTTP playback, interruptions, and recovery.
- `server/index.mjs`: current STT/Qwen proxy routes and canonical GPT Responses route.
- `server/faster_whisper_worker.py`: existing persistent Whisper model worker.
- `scripts/benchmark-voice.mjs`, `scripts/benchmark-local-voice.mjs`: current HTTP pipeline callers.
- `scripts/setup-voice.ps1`, `scripts/start-voice-services.ps1`, `scripts/run-paper-board.ps1`: local dependencies and process lifecycle.
- Approved user request: retain hosted GPT-6 teaching and tool calls while routing local model speech directly over WebRTC.

## Compatibility Boundary

Keep GPT Responses SSE, browser-side tool dispatch, VAD, transcript callbacks, mic mute, barge-in semantics, and AudioContext PCM scheduling. Replace the active browser HTTP STT/TTS consumers. Migrate benchmark requests to bounded local-host diagnostic HTTP endpoints that call the same Whisper/Qwen implementation; those endpoints are not used by the app. Local development gets a loopback default. Remote deployment requires HTTPS signaling, an RTC URL, suitable ICE/STUN/TURN connectivity, and access control/rate limits before exposing a GPU host publicly.

## Change Necessity

Docs or configuration alone cannot remove audio from the hosted app's request path. The minimum code change is a persistent local WebRTC/media owner, a browser signaling/control client, retirement of Node STT/TTS proxy handlers, and migration of their known benchmark callers.

## TDD Route

- Mode: off; decision: skipped.
- Authority: no explicit user/project TDD instruction; test posture follows the repository task instructions.
- Verification: TypeScript/Vite production build and static route/caller inspection. No tests are added or run.

## Tasks

1. Add the persistent RTC service beside the existing Whisper/Qwen services. Bound offer size, segment duration, retained frames, transcript/control messages, and PCM chunk size. Reuse the configured faster-whisper model and existing local Qwen endpoint. Add its dependency/setup/start/stop lifecycle.
2. Change `HybridTutor` to signal to `VOICE_RTC_URL`, send the microphone track, use VAD markers over the DataChannel, receive transcript/error events, and send/receive bounded Qwen PCM messages. Preserve interruption cancellation, muting, stop/close cleanup, and recovery after empty or failed recognition. Add RTC URL and ICE configuration to `/api/voice/config`.
3. Remove Node audio ingestion and Qwen proxy routes and their now-unused worker/proxy owners. Keep the GPT Responses route. Move the two benchmark scripts to the RTC host's diagnostic endpoints and update setup/local launcher, environment example, README, and current voice architecture docs.
4. Verify service behavior and app build; inspect all route and caller references; document deployment requirements and report that real remote ICE/TURN, GPU hosting, and public authentication need environment-level validation.

## Plan Pressure Test

- Owner/contract/retirement: one persistent RTC service owns local inference; one browser client owns VAD/tool dispatch; Node owns hosted GPT. Old HTTP STT/TTS app routes are retired after known benchmark consumers move.
- Architecture: one direct media path avoids pushing GPU inference through finite app HTTP handlers; retain current model serving implementations.
- Verification: tests can cover buffering, message limits, and route removal; actual GPU/model, microphone, NAT, and TURN behavior require a live host.
- Task executability: files and local startup path are identified; Python RTC dependencies must install in the existing ASR runtime.

## Risks

- WebRTC may fail across strict NAT/firewall combinations without a TURN server; STUN-only configuration is not a universal deployment solution.
- A public GPU host can be abused without real user authentication and rate limiting; no public deployment is part of this change.
- VAD markers and media frames arrive on separate RTC channels; short pre-roll and bounded buffering must tolerate scheduling jitter.
- Local models and hardware are not available in every build environment, so production build success is not proof of live speech quality or remote connectivity.

## Retirement

Retire `/api/voice/transcribe`, `/api/voice/speech`, Node's STT worker, and Node's Qwen proxy configuration after migrating the two observed benchmark consumers. Preserve `/api/voice/respond`, local VAD asset routes, and the actual faster-whisper/Qwen model services under the RTC process.

## Verification

- Static inspection of message/segment bounds and shutdown/cancel paths
- `npm run build`
- Search for app callers of retired Node audio routes and confirm none remain.
- If local models/dependencies are available, launch app and local service, establish a browser peer, and exercise speech, empty recognition, mute, interruption, and close/reconnect.

Execution route: inline; tasks share the WebRTC client/server contract and there is no independent slice worth parallelizing.
