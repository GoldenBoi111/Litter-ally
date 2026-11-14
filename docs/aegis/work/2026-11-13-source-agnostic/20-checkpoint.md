# Source-agnostic learning checkpoint

> Historical implementation checkpoint. Its completion and known-gap notes describe that workstream only; they do not establish completion of the current product requirements. See [product-requirements.md](../../../product-requirements.md) and the [product specification](../../../product-specification.md).

- Status: implementation complete; browser exercise remains
- Current task: finish source-neutral learning behavior after approval of the LearnHarness-inspired design.
- Completed: source contract and typed locators; bounded PDF, text/Markdown/code/CSV, web, image/OCR, media/transcription, PPTX, and XLSX adapters; generic planning/repair prompts; weak-answer repair and remaining-route revision; cross-source learner evidence profile; objective graph display separate from learner evidence; typed locator display in source-backed learning map; README capabilities and privacy notes.
- Completed: source picker combines library entries into one bounded plan input; each composed segment retains source ID, title, stable segment ID, and typed locator. Lesson selections persist as optional `sourceIds`; saved single-source plans remain compatible. The selected source keeps its own library data and canvas, and removing a source invalidates only the lesson route that depended on it.
- Next: manually exercise multi-source imports and lesson navigation in the browser when the app and model services are available.
- Known gaps: PPTX extraction reads slide text and notes but not embedded slide images; browser source imports and voice/model service behavior have not been manually exercised here. Existing plan schemas still call segment indices `sourcePages`, mapped to typed locators and stable source/segment references for storage and display.
- Verification: `npm run build`, server syntax checks, and `git diff --check` passed. No tests added or run because repository instructions say not to unless requested. Existing IndexedDB records and source imports were not manually inspected in a browser.
- Drift decision: continue inside approved source-agnostic scope. Keep papers supported, preserve local data, do not add cloud sync/Neo4j or copy LearnHarness implementation.
- Current branch/HEAD: `main` / `f05045f` (pre-existing project files are uncommitted; preserve them).
