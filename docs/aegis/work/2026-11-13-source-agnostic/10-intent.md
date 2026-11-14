# Source-agnostic learning workstream

> Historical workstream intent and decisions. Current product requirements are in [product-requirements.md](../../../product-requirements.md); the [product specification](../../../product-specification.md) governs if this workstream's narrower scope conflicts with the product direction.

## Task intent

- Outcome: a learner can set a goal and use common documents, web content, images, media, slides, spreadsheets, or code in the same adaptive learning loop.
- Scope: shared typed source/locator contract; safe local storage migration; first-pass adapters; global objective graph and separate learner evidence; DeepAgents diagnosis/planning/revision; automatic repair of weak checks; source-aware practice/navigation/docs.
- Non-goals: Neo4j, hosted accounts or sync, private/authenticated URL fetching, arbitrary crawling, copied LearnHarness code.
- Parent authority: approved design in `docs/aegis/plans/2026-11-13-source-agnostic-learning.md`; implementation plan in `docs/aegis/plans/2026-11-13-source-agnostic-learning-implementation.md`.
- Baseline: `src/storage.ts`, `src/pdfImport.ts`, `src/App.tsx`, `src/TutorPanel.tsx`, `src/learning.ts`, `src/lessonAgent.ts`, `src/hybridTutor.ts`, `server/index.mjs`, `server/learning-agent.mjs`, `server/learning.mjs`, `server/voice_rtc.py`, `package.json`.
- Compatibility: preserve existing PDF ids, paper data, source page citations, learning evidence, graph provenance, original PDF bytes, and tldraw persistence keys through an idempotent migration.
- Risk: parser dependencies and media extraction; accidental evidence loss; invalid locators or web URL SSRF; large client bundle.
- Success evidence: production build passes; migration preserves old records; supported imports yield bounded, navigable segments; plan, repair, practice, and graph references resolve to those segments.
- Stop states: done, needs-design-revision, needs-environment-verification.
- Branch / HEAD at start: `main` / `f05045f`.
- Baseline usage: read the approved source-agnostic design, current paper storage/import/learning flows, local WebRTC transcribe owner, and the ignored LearnHarness clone's learning methodology/data format.

## Decisions

- Port the learning design, not LearnHarness source code.
- Keep IndexedDB and local services as the initial owners.
- Use one shared source/segment contract and adapters, not per-format learning systems or unanchored text flattening.
- Keep the knowledge graph objective; store learner evidence separately.
- Use DeepAgents for diagnosis, planning, revision, and source-grounded extraction.
- Automatically repair/revise after weak answers; skip full replanning after clear answers.
- Do not add or run tests unless requested; verify with typecheck/build and scoped behavior inspection.
