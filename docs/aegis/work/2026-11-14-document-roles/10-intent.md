# Document roles and project guidance

## Task intent

- **Outcome:** Imported material is classified as content or process, represented by distinct editable cards, and process documents automatically guide explanations of content documents in the same project.
- **Parent authority:** Approved PR-15 in `docs/product-requirements.md` and approved Document Roles in `docs/product-specification.md` §10.2.
- **Scope:** Existing import/summary endpoint and client helper; persisted source role; project summary/synthesis/selection filtering; distinct accessible board card treatment and role correction; process guidance passed separately to planning, revision, text Q&A, and live voice; production build and scoped user-seam inspection.
- **Non-goals:** New storage/database owner, tldraw shape-prop migration, new dependency, separate classifier service, arbitrary project-role hierarchy, or source-citation changes.
- **Baseline read set:** Product requirements PR-15; product specification §§10.2, 10.4 and 12.2; `src/storage.ts`, `src/projects.ts`, `src/App.tsx`, `src/board/Board.tsx`, `src/board/shapes.tsx`, `src/board/board.css`, `src/learning.ts`, `src/lessonAgent.ts`, `src/hybridTutor.ts`, `server/index.mjs`, `server/learning-agent.mjs`.
- **Baseline usage:** Required and cited refs are the approved requirements/specification. Historical source-agnostic plans are advisory only. No missing requirement authority.
- **Compatibility:** Missing role on old records means content. Classification failure keeps the import as content. Existing source ids, project ids, content segments/citations, lesson state, and board shape props remain stable. Reclassification affects later analysis and lessons, not active/saved lesson content.
- **Impact:** `ImportedPaper.documentRole` owns source truth; board metadata mirrors the role. Process guidance is separate, bounded, validated user context, never content evidence or citation material.
- **Risks:** Incorrect model classification; broad/unrelated process documents in a project; process text attempting to override unrelated instructions; model service unavailable during import or live verification.
- **Success evidence:** Build passes; diff check passes; imported roles persist; card roles are visibly and accessibly distinct and can be corrected; same-project process context reaches lesson prompts without entering content citations, selected source segments, summaries, or comparisons.
- **Stop states:** done, blocked by an active shared-file collision, needs-verification when model/browser services are unavailable, or scope-exceeded if the change requires a new storage/API owner.
- **TDD route:** off / skipped; developer instruction prohibits adding or running tests unless requested. No tests are planned.
- **Branch/HEAD at start:** `arun/frontend-latest` / `20d7eb2cb0c8dcab9d47a2d644aad8dbad74bb48`; clean tracked/untracked status; no upstream ref, active merge, index lock, or other worktree was reported.
