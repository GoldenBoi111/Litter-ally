# AI Learning Canvas / Litter-ally

AI Learning Canvas is the product direction for Litter-ally: a personal AI teacher that thinks, explains, and draws alongside you on a persistent whiteboard. The current app is a local-first learning workspace that turns supplied materials into guided lessons on a resumable tldraw canvas. It currently imports PDFs, text, web pages, images, audio/video, slides, spreadsheets, and code.

[Read the canonical product specification](docs/product-specification.md). It describes the intended end-to-end teaching experience; the implementation and deployment limits below describe what this repository currently supports.

## Run locally

```powershell
npm install
./scripts/setup-voice.ps1
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run app:local
```

Set `OPENAI_API_KEY` in `.env` before building a teaching plan or starting the hybrid voice tutor. Set `EXA_API_KEY` to enable the DeepAgent's backend-owned reputable-source search for missing background. `app:local` starts local Qwen and the persistent WebRTC/Whisper host, chooses an available API port starting at `5186`, and runs the app (Vite starts at `5185` or the next open port); Ctrl+C stops the managed services. `npm run dev` remains available when you want to run the app without managing local voice services.

Copy your OpenAI project key into the existing local `.env` file before generating a plan:

```dotenv
OPENAI_API_KEY=your_project_key_here
EXA_API_KEY=your_exa_key_here
OPENAI_MODEL=gpt-6-luna
OPENAI_TEXT_MODEL=gpt-6-luna
LOCAL_STT_PROVIDER=faster_whisper
LOCAL_STT_MODEL=base.en
LOCAL_VAD_PROVIDER=silero
LOCAL_TTS_PROVIDER=audiocpp
LOCAL_TTS_MODEL=qwen3-custom
LOCAL_TTS_VOICE=Aiden
VOICE_RTC_URL=http://127.0.0.1:8190
VOICE_STREAMING=true
VOICE_BARGE_IN=true
```

Restart `npm run dev` after changing `.env`. The key is read only by the local Node server and `.env` is ignored by Git.

## Accounts and saved files

Create an account on the sign-in screen. Passwords are stored as salted scrypt hashes, and sessions use an HttpOnly, SameSite=Lax cookie that lasts 30 days. Every `/api` route except `/api/health` requires a signed-in user.

Each account's sources, files, learning map, board and lesson canvases are saved on disk under `data/users/<user id>/` (set `LITTERALLY_DATA_DIR` to move it). Writes go to a temp file and are renamed into place, so a crash never leaves a half-written file. Learning updates carry revision numbers, so two tabs can't overwrite each other's progress. The server sweeps stale temp files, orphaned files and canvases of deleted sources at startup and every 6 hours. `data/` is ignored by Git; back it up to keep your library.

Sources saved in the browser before accounts existed move into the first empty account that signs in on that browser. The browser copy is left in place, but lesson drawings made before the move stay in the browser and are not copied.

## Import and explore

- Import PDFs, plain text, Markdown, CSV, code files, PowerPoint slides, Excel workbooks, images, audio, video, or public HTTPS web pages. arXiv abstract and PDF links are supported.
- Text, code, CSV, and web pages are split into bounded, source-addressable segments. Images use local OCR. Audio/video are transcribed with local Whisper; video also retains sampled frames. PPTX and XLSX text is parsed locally by the app server; formulas and macros are never executed.
- Each source is stored separately in the local library. Select one source and optionally include others for a combined lesson, then set a goal, answer the short diagnostic, and follow the dependency-ordered checkpoints. Combined lessons keep each citation linked to its original source segment. A weak answer triggers a repair and revises the remaining route; clear answers keep the route.
- Answer reviews and retrieval-practice attempts are kept in a separate, dated learner profile. The knowledge graph stores source-grounded propositions and reasoning chains; it does not store learner mastery as a graph fact.
- Source locators preserve PDF pages, text/web sections, image regions, audio/video time ranges, slide numbers, spreadsheet ranges, and code line ranges. The canvas and tutor open the relevant source location where the adapter supports it.
- Local library and learner records use browser IndexedDB. PDFs and remote imports are limited to 25 MB, 300 pages/sections, and 1.5 million extracted characters. Text and office extraction are limited to 1.5 million characters; media is limited to 25 MB and 10 minutes. CSV is limited to 20,000 rows and 500 columns.
- Remote web imports require public HTTPS URLs; redirects to private/local addresses are rejected. OCR, audio transcription, and video frame extraction run locally. Check extracted text when OCR or transcription may be uncertain.

## Current boundary

Teaching plans, answer review, practice, and diagrams use the OpenAI Responses API with structured output. The planning DeepAgent may search reputable academic, educational, and official sources for missing background; background claims remain separate from the supplied material. A plan action sends extracted text for the selected material, and answer review sends the learner's submitted answer with relevant source evidence. Local import and library storage remain on this device.

Voice uses browser Silero VAD and WebRTC to the local faster-whisper/Qwen host, with streamed OpenAI Responses calls for the tutor. Raw microphone audio goes to the local RTC host rather than OpenAI or the hosted app; transcript text is sent to OpenAI. Public RTC hosting needs authentication, rate limits, and suitable ICE/TURN connectivity. This repo does not provision them. See [Hybrid voice setup and benchmark results](docs/hybrid-voice.md).

The local learner profile works across imported sources in this browser. It does not sync between devices. A deployed app still needs an API-function adapter, authentication, rate limits, storage changes, and a separately hosted voice service. Older PDFs imported before page-grounded teaching was added may need re-importing to retain their original bytes.
The [tldraw Agent Starter Kit](https://tldraw.dev/starter-kits/agent) and [editor API](https://tldraw.dev/docs/editor) describe the canvas architecture used here.
