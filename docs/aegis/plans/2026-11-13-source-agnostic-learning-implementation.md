# Source-agnostic learning implementation plan

## Goal

Implement the approved [source-agnostic learning design](2026-11-13-source-agnostic-learning.md): learners choose a goal and use PDFs, text/Markdown, public web pages, images, audio/video, slides, spreadsheets, and code through one learning loop. The graph contains source-grounded propositions and reasoning chains; learner evidence is stored separately and drives diagnosis, repair, replanning, and practice.

## Architecture

- `LearningSource` and typed `SourceLocator` are the canonical content/citation contract.
- Format adapters extract bounded source segments and retain original data for navigation.
- Existing IndexedDB remains the local source-of-truth. Existing paper records migrate transactionally to PDF sources, preserving evidence, graph provenance, and tldraw persistence keys.
- DeepAgents remains the diagnostic, planning, revision, and knowledge-extraction runtime. The OpenAI Responses and voice paths keep their current owners.
- IndexedDB—not Neo4j—stores cross-source objective knowledge, sessions, and evidence.

## Scope and non-goals

Implement every first-pass source type in the approved design. Keep the app local-first, preserve old PDF libraries and canvases, and only send selected source segments during explicit model actions. No hosted account/sync, Neo4j, authenticated/private URL imports, arbitrary web crawling, plugin framework, or copied LearnHarness code.

## Baseline refs

- `docs/aegis/plans/2026-11-13-source-agnostic-learning.md`
- `src/storage.ts`, `src/pdfImport.ts`, `src/paper-text.mjs`, `src/App.tsx`, `src/TutorPanel.tsx`
- `src/learning.ts`, `src/lessonAgent.ts`, `src/hybridTutor.ts`
- `server/index.mjs`, `server/learning-agent.mjs`, `server/learning.mjs`, `server/voice_rtc.py`
- `package.json`, `scripts/setup-voice.ps1`, `scripts/start-voice-rtc.ps1`

## Compatibility boundary

Keep existing paper ids as source ids during migration. Map page citations to typed PDF-page locators. Preserve saved plans, answers, practice, objective graph facts, PDF bytes, and each tldraw canvas key. Keep the existing voice transport and model ownership. Do not delete the old record shape until migrated reads are proven in the browser.

## TDD route

- Mode: off; decision: skipped.
- Authority: the repository instruction for this task says not to add or run tests unless requested.
- Verification: typecheck/production build, migration and caller inspection, and user-visible browser checks if the local environment supports them. Report any unverified format or device behavior.

## Change necessity

Docs alone cannot remove `paperId`, `sourcePages`, and PDF-only import assumptions from planning, graph provenance, practice, source navigation, and persistence. The minimum code boundary is one typed source contract, format adapters, a safe local migration, and updating every consumer to use source references.

## Tasks

1. **Map the current persistence and ingestion contracts.** Trace every `ImportedPaper`, `sourcePages`, `paperId`, and PDF-only importer caller, including graph, plan, practice, voice, navigation, and import UI. Select parser libraries that stay on the server/local Python path where possible; keep browser bundle growth bounded.
2. **Add source and locator contracts.** Create the source-neutral model for source metadata, stable segments, typed locators, and segment references. Update lesson plans, propositions, reasoning chains, assessments, and practice to use those references. Keep validation at every model/API boundary.
3. **Migrate local storage safely.** Add the source/profile/session records in IndexedDB, move old paper rows and page references transactionally, retain canvas keys and original PDF blobs, and keep retry-safe compatibility until migrated records are confirmed readable.
4. **Implement first-pass format adapters.** Add bounded extraction for PDF, text/Markdown, public web HTML, images/OCR, audio/video transcript and frame references, PPTX, XLSX, and code files. Preserve source locators, original media where needed, and clear parser warnings/errors. Enforce public-address checks on every URL redirect and resolved address.
5. **Generalize DeepAgents and learning flow.** Make diagnostic, planner, revision, extraction, and practice prompts consume selected source segments. Keep graph facts objective and evidence separate. Automatically repair weak checks and replan only incomplete steps; do not replan after clear answers unless a later dependency gap requires it. Preserve source citations in every generated result.
6. **Generalize the learner experience.** Replace paper labels with source/library/lesson language; allow selecting multiple source kinds for a goal; open typed citations from graph, plan, voice, check feedback, and practice. Keep the existing canvas for source display and diagram teaching, with format-specific source views behind the source adapter.
7. **Update docs and verify.** Document supported formats, extraction limits, data locality, model-call boundaries, and known parser limits. Run the production build and inspect all source/page references; exercise import, plan, check/repair, practice, source opening, and saved-data migration where the local environment permits.

## Risks

- PPTX, XLSX, and audio/video parsing may require dependencies and local services; do not load large parsers into the browser bundle.
- Image and video understanding needs media payloads, not OCR/transcript text alone; the model boundary must receive only selected media on explicit actions.
- A profile-level evidence migration touches persistent user records. Preserve old fields until successful readback; never bulk-delete legacy records as a cleanup shortcut.
- Source locators must remain navigable after edits and future importers; stable segment ids should not depend only on text offsets.

## Execution route

Inline. Contract, migration, adapters, and consumers share one evolving schema; splitting work would cause conflicting owners.
