# Graph Report - Litter-ally  (2026-11-13)

## Corpus Check
- 108 files · ~74,503 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .css 4, (none) 2, .toml 1)

## Summary
- 984 nodes · 2454 edges · 65 communities (46 shown, 19 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 128 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `37ce3333`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.mjs
- App.tsx
- package.json
- dependencies
- App.tsx
- package.json
- agent-actions.mjs
- voice_rtc.py
- scripts
- Ink
- textures.ts
- hooks.ts
- Get-VerifiedFile
- recipes/index.ts
- dependencies
- fills.ts
- pen.ts
- tabs.tsx
- shapes.ts
- builder.ts
- field-frame-ink.ts
- ref_node_assert
- learning-agent.mjs
- storage.ts
- .lines
- components.json
- draw-on-ink.ts
- clamp
- lessonAgent.ts
- types.ts
- TutorPanel.tsx
- defs.tsx
- text-marks-ink.ts
- PathWriter
- App
- button-ink.ts
- pens.ts
- provider.tsx
- main.tsx
- learning.mjs
- overlay-ink.ts
- buildCheckpointBrief
- InkCache
- sourceImport.ts
- source-import.mjs
- @astryxdesign/core
- clsx
- voice.test.mjs
- Rng
- paper-text.test.mjs
- coord
- ipaddr.js
- src/margin.js

## God Nodes (most connected - your core abstractions)
1. `Ink` - 50 edges
2. `App()` - 46 edges
3. `HybridTutor` - 32 edges
4. `clamp()` - 26 edges
5. `put()` - 20 edges
6. `seg()` - 17 edges
7. `PaintKey` - 17 edges
8. `drawFieldFrame()` - 17 edges
9. `Tier` - 17 edges
10. `Rng` - 16 edges

## Surprising Connections (you probably didn't know these)
- `readTeachingBeat()` --calls--> `validateTeachingBeat()`  [EXTRACTED]
  src/lessonAgent.ts → server/agent-actions.mjs
- `Get-VerifiedFile()` --calls--> `curl.exe()`  [INFERRED]
  scripts/download-verified.ps1 → scripts/test-setup-download.ps1
- `useInk()` --indirect_call--> `InkSvg()`  [INFERRED]
  src/lib/ink/react/hooks.ts → src/lib/ink/react/svg.tsx
- `PointerMarkOptions` --references--> `Tier`  [EXTRACTED]
  src/lib/ink/recipes/overlay-ink.ts → src/lib/ink/types.ts
- `PatternDefsOptions` --references--> `PaperTileName`  [EXTRACTED]
  src/lib/ink/textures.ts → src/lib/ink/textures-paper.generated.ts

## Import Cycles
- None detected.

## Communities (65 total, 19 thin omitted)

### Community 0 - "index.mjs"
Cohesion: 0.10
Nodes (17): app, builtVoiceAssets, createDiagramPlan(), createTeachingPlan(), fetchRemoteHtml(), fetchRemotePdf(), openAIKey(), ortDist (+9 more)

### Community 1 - "App.tsx"
Cohesion: 0.14
Nodes (12): pdfjs-dist, tldraw, ApiImportResult, ImportResult, IntakePanelProps, paperCanvasComponents, PaperStyleControls, finishPdfExtraction() (+4 more)

### Community 2 - "package.json"
Cohesion: 0.12
Nodes (14): HybridTutor, InputItem, recordMetric(), SpeechRequest, takeSpeakablePhrases(), TutorCallbacks, waitForDataChannel(), waitForIce() (+6 more)

### Community 3 - "dependencies"
Cohesion: 0.10
Nodes (13): audio, percentile(), runs, stt, summary(), tts, audio, measurements (+5 more)

### Community 4 - "App.tsx"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 5 - "package.json"
Cohesion: 0.14
Nodes (19): devDependencies, @astryxdesign/cli@^0.7.11, tailwindcss@^4.3.5, @tailwindcss/vite@^4.3.5, tw-animate-css@^1.4.0, @types/react@19.3.0, @types/react-dom@19.3.0, typescript@7.0.2 (+11 more)

### Community 6 - "agent-actions.mjs"
Cohesion: 0.19
Nodes (14): beatPointSchema, colors, diagramPlanSchema, finiteNumber(), shapeKinds, strokeSizes, teachingBeatSchema, valid (+6 more)

### Community 7 - "voice_rtc.py"
Cohesion: 0.08
Nodes (20): RequireLoopbackBindHostTests, close_peer(), require_loopback_bind_host(), cors(), diagnostic_speech(), diagnostic_transcribe(), handle_offer(), on_connectionstatechange() (+12 more)

### Community 8 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, app:local, build, dev, preview, test, voice:benchmark, voice:benchmark:local (+4 more)

### Community 9 - "Ink"
Cohesion: 0.09
Nodes (22): Ink, InkResult, Scope, BandOpts, BlobOpts, ClipOpts, flatFill(), esc() (+14 more)

### Community 10 - "textures.ts"
Cohesion: 0.08
Nodes (39): DEFAULT_REGION, deskBackground(), DeskBackgroundOptions, deskCss(), GRAIN_TILES, GrainMaskKind, GrainTile, GRAIN_KINDS (+31 more)

### Community 11 - "hooks.ts"
Cohesion: 0.13
Nodes (32): react, inkViewBox(), Frame, frameSvg(), inkCache, useEnsureInkDefs(), AnyRef, DEFAULT_INK_CONTEXT (+24 more)

### Community 14 - "recipes/index.ts"
Cohesion: 0.17
Nodes (24): InkOptions, Knobs, Entry, frameKey(), FrameRequest, inkFrame(), InkContextValue, UseInkOptions (+16 more)

### Community 22 - "dependencies"
Cohesion: 0.07
Nodes (28): dependencies, class-variance-authority@^0.7.1, deepagents@^1.16.4, express@5.3.0, @fontsource/ibm-plex-mono@^5.3.0, langchain@^1.6.5, @langchain/openai@^1.8.4, multer@2.5.0 (+20 more)

### Community 23 - "fills.ts"
Cohesion: 0.15
Nodes (20): blobFill(), defaultMis(), laid(), Offset, PolyFillOpts, rough(), shiftOf(), area() (+12 more)

### Community 24 - "pen.ts"
Cohesion: 0.19
Nodes (22): densify(), fillet(), mixPt(), resample(), smoothClosed(), spline(), TierCfg, noise1() (+14 more)

### Community 25 - "tabs.tsx"
Cohesion: 0.18
Nodes (21): class-variance-authority, radix-ui, IntakePanel(), Button(), buttonVariants, Input(), InputControl(), isTrue() (+13 more)

### Community 26 - "shapes.ts"
Cohesion: 0.15
Nodes (23): fieldErrorRecipe, arrow(), asterisk(), BoxOpts, bracket(), burst(), check(), checkLines() (+15 more)

### Community 27 - "builder.ts"
Cohesion: 0.10
Nodes (19): BLENDED, GRAIN_OF, GRAINS, GroupAttrs, Item, MASK_IDS, MASK_VARIANTS, maskId() (+11 more)

### Community 28 - "field-frame-ink.ts"
Cohesion: 0.21
Nodes (18): wash(), pillPoly(), rectPoly(), roundRectPoly(), buttonRecipe, drawFieldFrame(), FieldFrameParams, grip() (+10 more)

### Community 29 - "ref_node_assert"
Cohesion: 0.13
Nodes (6): vite@8.3.7, vite, source, source, source, voiceAssets

### Community 30 - "learning-agent.mjs"
Cohesion: 0.14
Nodes (19): backgroundSearchDomains, checkpoint, concept, createAdaptivePlanRevision(), createAgent(), createBackgroundSearchTool(), createLearningDiagnostic(), diagnosticSchema (+11 more)

### Community 31 - "storage.ts"
Cohesion: 0.13
Nodes (21): deletePaper(), GraphUpdate, KnowledgeEdge, KnowledgeNode, KnowledgeProvenance, KnowledgeReasoningLink, LearningProfile, LearningSource (+13 more)

### Community 32 - ".lines"
Cohesion: 0.14
Nodes (17): mergeOpts(), contourArcs(), edgeBand(), hatch(), loosen(), stipple(), CIRCLE, circleTile() (+9 more)

### Community 33 - "components.json"
Cohesion: 0.10
Nodes (19): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+11 more)

### Community 34 - "draw-on-ink.ts"
Cohesion: 0.15
Nodes (14): REVEAL_DASH, REVEAL_WHEN_CHECKED, REVEAL_WHEN_INDETERMINATE, REVEAL_WHEN_ON, revealId(), MARGIN_BRACKET_DRAW, MarginBracketParams, marginBracketRecipe (+6 more)

### Community 35 - "clamp"
Cohesion: 0.23
Nodes (18): bandPoly(), misreg(), seg(), clamp(), arrowLines(), asteriskLines(), boxLines(), bracketLines() (+10 more)

### Community 36 - "lessonAgent.ts"
Cohesion: 0.16
Nodes (17): applyDiagramPlan(), applyTeachingBeat(), beatOrigin(), DiagramAction, DiagramBrief, DiagramPlan, getSelectionContext(), getTeachingExecutionState() (+9 more)

### Community 37 - "types.ts"
Cohesion: 0.26
Nodes (13): HatchOpts, RevealOpts, bang(), MarkRevealOpts, bang(), ShapeOpts, Line, PenKind (+5 more)

### Community 38 - "TutorPanel.tsx"
Cohesion: 0.19
Nodes (14): TutorStatus, AnswerReview, defaultLearningGoal, LearningDiagnostic, LearningStatus, PracticeCheckpoint, PracticeQuestion, requestAdaptivePlan() (+6 more)

### Community 39 - "defs.tsx"
Cohesion: 0.21
Nodes (15): defsMarkup(), ensureInkDefs(), ensureInkFonts(), first(), hasInjected(), InkDefs(), InkTiles(), instances (+7 more)

### Community 40 - "text-marks-ink.ts"
Cohesion: 0.13
Nodes (11): FELT, FontRatios, GUESS_RATIOS, HIGHLIGHT_TONES, HighlightTone, LineMetrics, LineParams, MarkPen (+3 more)

### Community 41 - "PathWriter"
Cohesion: 0.31
Nodes (6): PathWriter, polyPath(), simplePath(), simplifyClosed(), fmtUnits(), Q

### Community 42 - "App"
Cohesion: 0.22
Nodes (13): App(), combineLearningSources(), errorMessage(), initializePaperCanvas(), readApiResult(), assessAnswer(), extractTaughtKnowledge(), readResult() (+5 more)

### Community 43 - "button-ink.ts"
Cohesion: 0.18
Nodes (12): bandFill(), clipFill(), polyFill(), solidAlpha(), solidFill(), sweepFill(), ButtonParams, ButtonSize (+4 more)

### Community 44 - "pens.ts"
Cohesion: 0.19
Nodes (11): ACCENTS, BASE, build(), felt(), FELTS, marker(), PENCILS, PENS (+3 more)

### Community 45 - "provider.tsx"
Cohesion: 0.22
Nodes (12): InkContext, InkScopeProps, ATTRS, InkProvider(), num(), readKnobs(), sameKnobs(), wrapperStyle (+4 more)

### Community 46 - "main.tsx"
Cohesion: 0.21
Nodes (6): react-dom@19.3.1, react-dom, defaultThemeSlug, themes, ThemeSlug, marginTheme

### Community 47 - "learning.mjs"
Cohesion: 0.23
Nodes (8): createAnswerReview(), createPracticeQuestion(), practiceSchema, reviewSchema, statuses, input, page, createStructuredResponse()

### Community 48 - "overlay-ink.ts"
Cohesion: 0.24
Nodes (8): highlight(), defineRecipe(), InputParams, inputRecipe, CloseMarkParams, closeMarkRecipe, PointerMarkOptions, cross()

### Community 49 - "buildCheckpointBrief"
Cohesion: 0.31
Nodes (9): buildCheckpointBrief(), formatSourceLocator(), knowledgeNodeId(), latestConceptEvidence(), mergeTaughtKnowledge(), recordPlanKnowledge(), refsForPages(), sourceRefsForPages() (+1 more)

### Community 51 - "sourceImport.ts"
Cohesion: 0.43
Nodes (7): importImageSource(), importMediaSource(), importTextSource(), parseCsv(), record(), splitText(), SourceSegment

### Community 52 - "source-import.mjs"
Cohesion: 0.52
Nodes (5): extractOfficeSource(), pptxSegments(), xlsxSegments(), xmlText(), zipEntries()

### Community 53 - "@astryxdesign/core"
Cohesion: 0.33
Nodes (3): @astryxdesign/core@^0.7.11, @astryxdesign/core, marginTheme

### Community 54 - "clsx"
Cohesion: 0.20
Nodes (6): clsx@^2.1.1, concurrently@10.0.7, @vitejs/plugin-react@6.3.0, clsx, concurrently, @vitejs/plugin-react

### Community 55 - "voice.test.mjs"
Cohesion: 0.60
Nodes (4): safeResponsesVoiceEvents(), validateVoiceRequest(), validSpeechText(), validVoiceAudio()

## Knowledge Gaps
- **1 isolated node(s):** `node`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 285 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `hooks.ts` to `App.tsx`, `package.json`, `TutorPanel.tsx`, `defs.tsx`, `provider.tsx`, `main.tsx`, `dependencies`, `tabs.tsx`?**
  _High betweenness centrality (0.225) - this node is a cross-community bridge._
- **What connects `node` to the rest of the system?**
  _1 weakly-connected nodes found - possible missing edges._
- **Should `index.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.09686609686609686 - nodes in this community are weakly interconnected._
- **Why does `Ink` connect `Ink` to `.lines`, `draw-on-ink.ts`, `types.ts`, `recipes/index.ts`, `overlay-ink.ts`, `fills.ts`, `Rng`, `shapes.ts`, `builder.ts`, `field-frame-ink.ts`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1380952380952381 - nodes in this community are weakly interconnected._
- **Why does `HybridTutor` connect `package.json` to `App.tsx`, `App`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.11522198731501057 - nodes in this community are weakly interconnected._