# Source-agnostic learning loop

**Status: approved design.** This ports LearnHarness's learning behavior into this app; it does not copy its implementation.

## Goal

Let a learner choose a goal and learn from any supplied material. Papers remain supported, but they are one source type. The reusable product is the learning loop and the learner's cross-source knowledge model.

## Learning loop

1. Diagnose current understanding and clarify the learner's goal with short open questions that elicit reasoning, uncertainty, and confidence.
2. Plan a dependency route from that evidence to the goal. Use provided materials as evidence and search reputable sources only for missing background; keep source claims and background claims distinct.
3. Teach one reasoning step at a time. Ask the learner to predict or explain, then check the step before building on it.
4. When a check reveals a gap, repair that step and automatically revise only the remaining route. Preserve completed learning and source evidence.
5. Offer separate retrieval and application practice. Use the learner's answers and explanations as evidence for future diagnosis and planning.

The knowledge graph records objective propositions and reasoning chains. It does not assert mastery. Learner answers, self-reported confidence, attempts, and reviews live in a separate evidence record. Future sessions may use that dated evidence to form a tentative view of understanding; no scalar mastery score is stored as an objective graph fact.

## Shared source model

Replace paper-specific concepts in learning contracts with a source-neutral model:

- `LearningSource`: stable id, title, origin, source type, import metadata, and ordered segments.
- `SourceSegment`: stable id, extracted text and optional media reference, plus a typed locator.
- `SourceRef`: source id and one or more segment ids. Agent outputs, graph provenance, assessments, and practice use this reference rather than `paperId` plus `sourcePages`.
- `LearningSession`: learner goal, selected sources, diagnostic evidence, plan revision, completed steps, checks, repairs, and practice history.

Locators preserve the meaningful address for each source: PDF page; text or web section; image region; audio/video time interval (and video frame when available); slide number; workbook sheet and cell range; or code file and line range. The UI renders and opens each locator through its source adapter.

## First source adapters

Support these through the same source and citation contracts:

- PDFs, plain text, and Markdown.
- Public web pages, with safe URL fetching and section anchors.
- Images, retaining the image for visual understanding and using local OCR for searchable text.
- Audio and video, with timestamped transcripts; video may also expose timestamped frames.
- Slide decks, preserving slide numbers, text, speaker notes, and embedded images.
- Spreadsheets, preserving workbook, sheet, cell/range, values, and formulas.
- Code, preserving file paths, language, symbols where available, and line ranges.

Adapters extract content into bounded segments; they do not independently implement planning, graph logic, or teaching. Unsupported, encrypted, malformed, oversized, or low-confidence extraction must produce a clear import error or a visible extraction warning, never fabricated content or citations.

## Agents and boundaries

- The diagnostic agent reads selected source segments and recent learner evidence; it asks questions but does not reveal answers.
- The planner reads the selected sources, current objective graph, diagnostic responses, and recent evidence. It returns a dependency route with source references and separately cited background.
- The teacher follows the route in the canvas and voice tutor, checks each reasoning step, and requests repair when a step does not land.
- The repair/revision agent keeps completed steps fixed, repairs the current gap, and revises upcoming steps. It cannot create unsupported source references.
- The practice agent creates retrieval/application tasks from the selected sources and graph, while retaining answer provenance.
- Keep DeepAgents as the diagnostic/planning/revision/extraction runtime, with read-only source tools and structured validated results; do not add a second agent framework.
- All model-authored output is schema-validated. Learner text and imported material are untrusted data, not instructions.

## Persistence and migration

Keep local IndexedDB as the initial storage owner; do not add Neo4j or cloud sync in this change. Store sources and their extracted segments in the library, and store the learner's cross-source graph, sessions, and evidence in a profile-level record. Preserve each source's tldraw canvas.

Migrate existing `ImportedPaper` rows as `pdf` sources using their current id. Translate legacy page citations to PDF-page locators. Preserve plans, answers, practice, graph nodes, reasoning links/chains, PDF bytes, and canvas persistence keys. Migration must be transactional and safe to retry; no existing learning record may be dropped if a row is malformed or partially migrated.

## Privacy and safety

Keep source files, extraction, and learning records on-device by default. Send only the source segments needed for an explicit model action. Keep mic audio on the current local voice path. Public web imports must retain the existing public-address protections and add equivalent redirect/DNS checks; file parsers need input, memory, and extraction limits. Never execute uploaded code, macros, formulas, or embedded scripts.

## Acceptance criteria

- A learner can select a goal and combine any supported first-pass source types in one learning session.
- Every paper claim, background claim, graph provenance link, check, and practice question points to resolvable source segments.
- Page, section, timestamp, slide, spreadsheet range, image region, and code-line references are distinguishable and navigable.
- The objective graph persists propositions and reasoning chains across sources, while learner evidence remains separate and informs later diagnosis, planning, repair, and practice.
- A weak answer triggers a repair and an updated remaining route without changing completed steps; a clear answer can continue the route without an unnecessary full replan.
- Existing PDF library entries, plans, evidence, and canvases remain readable after migration.
- Invalid source extraction or invalid agent citations fail visibly without silently storing unsupported claims.

## Non-goals

- Neo4j, hosted learner accounts, or cross-device synchronization.
- Crawling arbitrary websites or importing authenticated/private URLs.
- Treating graph inclusion, completed checkpoints, or self-reported confidence as proof of mastery.
- Copying LearnHarness source code. Its repository is AGPL-3.0; this design borrows behavior and data principles only.

## Risks to resolve during implementation

- PPTX, XLSX, and media parsers may add dependencies, bundle weight, memory use, and platform-specific behavior; prefer local parsing or the existing local Whisper service and measure any new weight.
- A generic locator contract touches ingest, agent output schemas, citations, persisted graph/evidence, voice, and tldraw navigation. Keep adapters as the only format-specific layer.
- IndexedDB is still per-device. The profile-level graph is cross-source within this browser only.
