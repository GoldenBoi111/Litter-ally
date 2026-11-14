# Document roles and project guidance implementation plan

## Goal

Implement approved requirement PR-15 and the [document roles specification](../../product-specification.md#document-roles): classify imports as content or process, show distinct editable cards, and automatically use project process documents as guidance for content lessons.

## Architecture

- `ImportedPaper.documentRole` is the source of truth. Missing roles on existing records mean `content`; no record migration is required.
- Reuse the existing structured source-summary request at import to return both the source summary and role. If it fails, finish the import as content.
- Keep board role state in the existing tldraw shape `meta`, not required shape props, to preserve persisted canvas compatibility.
- Process documents remain project sources and board cards, but do not enter content summaries, synthesis, comparisons, lesson segments, or citations.
- Send same-project process text separately from selected content evidence to lesson planning, revision, text Q&A, and live voice. Validate and bound it at the server boundary. Treat it as user-supplied guidance scoped to explanation style and method; it cannot override system rules, safety, source grounding, or the learner's current request.

## Tech stack

Existing React/TypeScript client, Express API, OpenAI structured responses, IndexedDB-backed source records, and tldraw custom shapes. No new dependency or persistence owner.

## Baseline and authority references

- Approved: `docs/product-requirements.md` PR-15 and `docs/product-specification.md` §10.2 Document Roles.
- Source and persistence: `src/storage.ts`, `src/projects.ts`, `src/App.tsx`.
- Board cards: `src/board/Board.tsx`, `src/board/shapes.tsx`, `src/board/board.css`.
- Lesson requests: `src/learning.ts`, `src/lessonAgent.ts`, `src/hybridTutor.ts`, `server/index.mjs`, `server/learning-agent.mjs`.
- Project comparison: `src/projects.ts`, project source derivation and analysis in `src/App.tsx`.

## Compatibility boundary

- Old saved sources without `documentRole` continue to behave as content.
- Classification failure never blocks import and defaults the source to content.
- Keep existing `source-card` required props, saved plans, segment ids, citations, project ids, and canvas persistence keys unchanged.
- Reclassification affects later project analysis and lessons; it does not rewrite an already active or saved lesson.
- Keep process text separate from content segments and citations at every API and prompt boundary.
- Preserve the fallback to content unless a future product decision replaces it; it is required for legacy data and classifier outages.

## Requirement readiness

- Approved outcome: saved automatic `content`/`process` classification, correction from the card, visually distinct cards, and automatic same-project process guidance.
- Scenarios: successful import, classifier failure, legacy source without a role, user role correction, content lesson with one or more same-project process documents, and project with no process documents.
- Acceptance: role survives reload; cards identify their roles in text and appearance; correction is keyboard accessible; process docs guide explanations but never appear as content evidence/citations or in content-only project analysis.

## Change necessity

Docs alone cannot persist a role, draw distinct cards, let learners correct it, filter project analysis, or pass process guidance through lesson requests. The minimum code boundary is the existing import/summary path, source record, board card, project analysis filters, and existing planner/tutor request owners.

## Ripple signal triage

- **Canonical owner:** `ImportedPaper.documentRole`; legacy absence means content.
- **Producer:** existing source-summary response returns classification at import; failure is recoverable and defaults to content.
- **Consumers:** board cards and correction, project summaries/synthesis, content source selection, lesson planner/revision, text Q&A, and live tutor.
- **Source of truth:** source record, not tldraw metadata. Card metadata is a persisted view mirror only.
- **Compatibility/fallback:** no storage or tldraw prop migration; preserve the content fallback. Validate the separate process-guidance field at the server boundary and keep it out of citations.
- **Retirement:** no duplicate classifier, per-card classification cache, or new source owner is introduced.

## TDD route

- Mode: off; decision: skipped.
- Authority: developer instruction says not to add or run tests unless the user asks for testing or verification.
- Test posture: add and run no tests for this change.
- Verification: production build, `git diff --check`, and inspection of the import, card correction, project-analysis, and lesson-prompt seams.

## Plan pressure test

- Edit existing owners; add no adapter, service, dependency, or shape-prop schema.
- Keep `App.tsx` as wiring only; source analysis stays in `projects.ts`, role storage in `storage.ts`, and card UI in the existing board shape.
- The same document role must be respected by all project-analysis and lesson request consumers; verify each seam before completion.
- Execute inline because the source contract and project/lesson consumers change together and the shared checkout is coordinated by other active work.

## Tasks

1. **Persist classification at import.** Extend `ImportedPaper` with an optional role whose absent value is content. Extend the existing summary request/response to classify as well as summarize. In the import path, save the returned role; on classification failure, save content and continue. Reuse the analysis result for an active content project's summary so import does not trigger an avoidable duplicate request. Keep process sources out of the summary/synthesis inputs and invalidate content analysis when project role membership changes.
2. **Add distinct, editable board cards.** Render explicit Content or Process labels and distinct existing-style card treatment. Add a keyboard-accessible role toggle; save the source record first and update the card mirror only after persistence succeeds. Process cards identify their project-guidance role. Keep tldraw shape props unchanged and keep manually created board work intact.
3. **Apply project guidance to content lessons.** Derive guidance only from process documents in the active project. Keep content lesson sources and citations unchanged. Pass guidance separately through plan creation/revision, text Q&A, and live voice. Filter process documents from content lesson selection and project comparison/synthesis. Scope the guidance prompt to relevant explanation approach and preserve higher-priority system, safety, citation, and learner-request rules.
4. **Verify the user-facing seam.** Run `npm run build` and `git diff --check`. Inspect an imported content/process pair in a project, role correction and reload, content-only analysis, and a content lesson with and without same-project process guidance when the model service is available. Do not add or run tests.

## Risks

- Model classification may be wrong; correction from the card is the recovery path.
- Same-project guidance can be unrelated or conflict internally; keep it project-scoped, separate from evidence, and subordinate to the learner's request and existing system rules.
- Classifier/service failure leaves a source as content; the user can reclassify it later.
- If the model service is unavailable, live verification of generated teaching behavior may be incomplete even when the production build passes.
