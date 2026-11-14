# Graph Report - 2108deec-b9ee-4ebc-87e4-c6e113c34f53  (2026-11-11)

## Corpus Check
- 40 files · ~22,735 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 3, .css 2, .toml 1)

## Summary
- 266 nodes · 468 edges · 19 communities (8 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5200b839`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.mjs
- compilerOptions
- package.json
- dependencies
- App.tsx
- package.json
- agent-actions.mjs
- scripts

## God Nodes (most connected - your core abstractions)
1. `App()` - 29 edges
2. `HybridTutor` - 23 edges
3. `compilerOptions` - 15 edges
4. `scripts` - 11 edges
5. `recordMetric()` - 8 edges
6. `formatCheckpointBrief()` - 8 edges
7. `validateDiagramPlan()` - 6 edges
8. `CheckpointBrief` - 6 edges
9. `buildCheckpointBrief()` - 6 edges
10. `openLibrary()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `createDiagramPlan()` --calls--> `validateDiagramPlan()`  [EXTRACTED]
  server/index.mjs → server/agent-actions.mjs
- `createTeachingPlan()` --calls--> `validateTeachingPlan()`  [EXTRACTED]
  server/index.mjs → server/lesson-plan.mjs
- `App()` --calls--> `HybridTutor`  [EXTRACTED]
  src/App.tsx → src/hybridTutor.ts
- `App()` --calls--> `applyDiagramPlan()`  [EXTRACTED]
  src/App.tsx → src/lessonAgent.ts
- `App()` --calls--> `formatCheckpointBrief()`  [EXTRACTED]
  src/App.tsx → src/lessonAgent.ts

## Import Cycles
- None detected.

## Communities (19 total, 11 thin omitted)

### Community 0 - "index.mjs"
Cohesion: 0.08
Nodes (29): app, createDiagramPlan(), createTeachingPlan(), fetchRemotePdf(), getSttWorker(), openAIKey(), ortDist, pinnedPublicAddress() (+21 more)

### Community 1 - "compilerOptions"
Cohesion: 0.10
Nodes (42): tldraw, ApiImportResult, App(), errorMessage(), ImportResult, initializePaperCanvas(), IntakePanel(), IntakePanelProps (+34 more)

### Community 2 - "package.json"
Cohesion: 0.12
Nodes (15): HybridTutor, InputItem, recordMetric(), takeSpeakablePhrases(), TutorCallbacks, applyDiagramPlan(), CheckpointBrief, DiagramAction (+7 more)

### Community 3 - "dependencies"
Cohesion: 0.10
Nodes (13): audio, percentile(), runs, stt, summary(), tts, audio, measurements (+5 more)

### Community 4 - "App.tsx"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+8 more)

### Community 5 - "package.json"
Cohesion: 0.06
Nodes (39): dependencies, @astryxdesign/core@^0.7.11, concurrently@10.0.7, express@5.3.0, ipaddr.js@2.5.0, multer@2.5.0, pdfjs-dist@6.5.438, react@19.3.1 (+31 more)

### Community 6 - "agent-actions.mjs"
Cohesion: 0.16
Nodes (10): colors, diagramPlanSchema, isNumber(), pointSchema, shapeKinds, valid, validateDiagramPlan(), validId() (+2 more)

### Community 8 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, app:local, build, dev, preview, test, voice:benchmark, voice:benchmark:local (+3 more)

## Knowledge Gaps
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pdfjs-dist` connect `package.json` to `index.mjs`, `compilerOptions`?**
  _High betweenness centrality (0.174) - this node is a cross-community bridge._
- **Should `index.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Why does `HybridTutor` connect `package.json` to `compilerOptions`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Why does `App()` connect `compilerOptions` to `package.json`, `package.json`, `agent-actions.mjs`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.12312312312312312 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.1038961038961039 - nodes in this community are weakly interconnected._