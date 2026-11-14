# Agent-led teaching canvas

> Historical plan: the original implementation used Chat Completions for voice. The current voice tutor uses Responses API streaming with medium reasoning; the original design notes below are retained as a record of the implementation plan.

## Goal

Turn an imported paper into an agent-led sequence of checkpoint lessons. The tutor speaks, draws multiple runtime diagrams on the tldraw canvas, supports play/pause/back/skip, stops when the page is hidden, and can explain the learner's current canvas selection.

## Architecture

Adapt the tldraw Agent Starter Kit's useful boundaries instead of importing its whole demo: canvas context is gathered as prompt parts; model output is a small validated action vocabulary; actions are applied incrementally and cancellably; checkpoint state owns follow-up work. `server/index.mjs` remains the OpenAI boundary and `src/App.tsx` remains the canvas/session orchestrator. A small pure action module is the only new owner.

At the time this plan was written, the voice path superseded the original Realtime design: browser Silero VAD segments WebRTC media capture locally, faster-whisper transcribes on-device, OpenAI Chat Completions streams tutor text, and local Qwen streams speech. The browser never receives the project API key or sends raw microphone audio to OpenAI.

## Tech stack and authority

- Existing React, Vite, Express, tldraw, and Astryx packages.
- tldraw Agent Starter Kit: typed `AgentActionUtil`/`PromptPartUtil` pattern, incremental application, modes, prompt/cancel/schedule semantics.
- OpenAI Chat Completions streaming with narrow function tools; local Silero VAD, faster-whisper, and Qwen3-TTS own the audio path.
- Approved in the conversation on 2026-11-10.

## Compatibility boundary

PDF ingestion, IndexedDB paper storage, saved tldraw canvases, manual canvas editing, and the existing teaching-plan action continue to work. Agent actions may replace only shapes tagged with matching agent/lesson/checkpoint metadata; user-created shapes are never cleared. Source text leaves the device only after the user starts the corresponding OpenAI action; microphone audio remains local.

## Change necessity

Copy and styling changes cannot supply runtime diagrams, cancellation, voice state, or selection-aware questions. The minimum code boundary is: extend the plan contract with checkpoints/diagram briefs; add one diagram-action endpoint plus a streamed Chat Completions endpoint; add one validated action applicator and a checkpoint control surface.

## Existence check

- Proposed surface: validated lesson diagram actions and a locally transcribed voice session.
- Reuse candidates: existing `/api/teach`, `placeTeachingPlan`, `Editor` ref, and Astryx controls.
- Why insufficient: the current plan is a static note pile and has no session lifecycle, voice transport, or safe action contract.
- Decision: add with proof. Retire static full-plan placement as the primary teaching path; retain the generated plan as the lesson source and manual fallback.

## TDD route

Mode `auto`, decision `strict`, authority: the change adds producer/consumer API contracts and model-output validation. Add focused Node tests for rejecting malformed actions and protecting user shapes; verify the UI at the rendered seam after implementation.

## Tasks

1. **Lesson and visual contracts** — update `server/index.mjs`, add `server/agent-actions.mjs` and `server/agent-actions.test.mjs`. Extend teaching checkpoints with visual briefs; generate and validate a bounded action list; expose `/api/diagram` and `/api/voice/respond`. Verify boundary validation, missing-key errors, and protected deletion behavior.
2. **Checkpoint conductor and tldraw actions** — add `src/lessonAgent.ts` and integrate it in `src/App.tsx`. Apply create/label/connect/draw/focus actions incrementally, tag every generated shape, cancel on pause/page hide, and carry selection bounds/shape summaries into questions. Keep one active run with `AbortController`.
3. **Voice and control surface** — use `src/hybridTutor.ts` for local VAD/STT, streamed Chat Completions, and Qwen playback, then replace the paper-detail rail with the approved Tutor panel using Astryx `Toolbar`, `ButtonGroup`, `IconButton`, text, and disclosure components. Show checkpoint progress, voice/session state, transcript, start/play/pause/back/skip, and Ask about selection with keyboard labels and recovery states.
4. **Verification and retirement** — run focused tests and production build; exercise empty, loading, success, pause, hidden-tab, skip, API failure, selection question, desktop, and narrow layouts. Confirm user shapes survive regeneration and the API key never enters the client bundle. Remove obsolete static placement/copy only after the new path is proven.

## Acceptance evidence

- Starting a lesson speaks and draws at least two visually distinct diagrams for its checkpoint at runtime.
- Pause and hidden-tab cancellation stop speech and drawing; play resumes from saved checkpoint state; skip/back select the adjacent checkpoint.
- Selecting or circling canvas content and asking a question gives the tutor bounds plus structured information about intersecting shapes.
- Every generated shape is attributable to a lesson/checkpoint/diagram and can be regenerated without deleting user work.
- The UI remains usable by keyboard and at wide/narrow viewports, with visible loading, failure, cancel, and retry paths.
- `npm test` and `npm run build` pass; rendered behavior is inspected in Amoeba's browser.

## Risks and stop conditions

Model-generated diagrams can be slow or invalid; validation and bounded actions must fail visibly without mutating the canvas. Browser microphone permission and local model readiness cannot be proven by build alone. Stop rather than exposing the standard API key, allowing arbitrary model-authored canvas deletion, or silently continuing speech/drawing while the document is hidden.
