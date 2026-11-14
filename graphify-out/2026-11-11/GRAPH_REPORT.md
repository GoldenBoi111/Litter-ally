# Graph Report - 2108deec-b9ee-4ebc-87e4-c6e113c34f53  (2026-11-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 286 nodes · 502 edges · 22 communities (11 shown, 11 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
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
- vite
- scripts
- scripts
- main.tsx
- pdfjs-dist
- vite

## God Nodes (most connected - your core abstractions)
1. `App()` - 26 edges
2. `HybridTutor` - 22 edges
3. `compilerOptions` - 15 edges
4. `CheckpointBrief` - 13 edges
5. `formatCheckpointBrief()` - 12 edges
6. `TutorController` - 11 edges
7. `scripts` - 11 edges
8. `RealtimeTutor` - 10 edges
9. `recordMetric()` - 8 edges
10. `validateDiagramPlan()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `RealtimeTutor`  [EXTRACTED]
  src/App.tsx → src/realtimeTutor.ts
- `App()` --calls--> `readPaperPage()`  [EXTRACTED]
  src/App.tsx → src/paper-text.mjs
- `App()` --calls--> `formatCheckpointBrief()`  [EXTRACTED]
  src/App.tsx → src/lessonAgent.ts
- `HybridTutor` --references--> `CheckpointBrief`  [EXTRACTED]
  src/hybridTutor.ts → src/lessonAgent.ts
- `HybridTutor` --implements--> `TutorController`  [EXTRACTED]
  src/hybridTutor.ts → src/realtimeTutor.ts

## Import Cycles
- None detected.

## Communities (22 total, 11 thin omitted)

### Community 0 - "index.mjs"
Cohesion: 0.06
Nodes (40): colors, diagramPlanSchema, isNumber(), pointSchema, shapeKinds, valid, validateDiagramPlan(), validId() (+32 more)

### Community 1 - "compilerOptions"
Cohesion: 0.09
Nodes (44): tldraw, ApiImportResult, App(), errorMessage(), ImportResult, initializePaperCanvas(), IntakePanel(), IntakePanelProps (+36 more)

### Community 2 - "package.json"
Cohesion: 0.09
Nodes (13): HybridTutor, InputItem, recordMetric(), takeSpeakablePhrases(), CheckpointBrief, formatCheckpointBrief(), SelectionContext, RealtimeTutor (+5 more)

### Community 3 - "dependencies"
Cohesion: 0.10
Nodes (13): audio, percentile(), runs, stt, summary(), tts, audio, measurements (+5 more)

### Community 4 - "App.tsx"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+8 more)

### Community 5 - "vite"
Cohesion: 0.19
Nodes (13): devDependencies, @astryxdesign/cli@^0.7.11, @types/react@latest, @types/react-dom@latest, typescript@latest, name, private, type (+5 more)

### Community 6 - "scripts"
Cohesion: 0.14
Nodes (14): dependencies, concurrently@latest, express@latest, ipaddr.js@latest, multer@latest, @openai/agents@^0.21.0, @ricky0123/vad-web@^0.0.31, tldraw@latest (+6 more)

### Community 8 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, app:local, build, dev, preview, test, voice:benchmark, voice:benchmark:local (+3 more)

### Community 9 - "main.tsx"
Cohesion: 0.22
Nodes (6): @astryxdesign/core@^0.7.11, react@latest, react-dom@latest, @astryxdesign/core, react, react-dom

### Community 10 - "pdfjs-dist"
Cohesion: 0.33
Nodes (4): pdfjs-dist@latest, tesseract.js@^7.0.0, pdfjs-dist, tesseract.js

### Community 11 - "vite"
Cohesion: 0.40
Nodes (4): vite@latest, @vitejs/plugin-react@latest, vite, @vitejs/plugin-react

## Knowledge Gaps
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pdfjs-dist` connect `pdfjs-dist` to `index.mjs`, `compilerOptions`, `vite`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Should `index.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.056107539450613676 - nodes in this community are weakly interconnected._
- **Why does `App()` connect `compilerOptions` to `index.mjs`, `main.tsx`, `package.json`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09125188536953242 - nodes in this community are weakly interconnected._
- **Why does `scripts` connect `scripts` to `vite`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08549019607843138 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.1038961038961039 - nodes in this community are weakly interconnected._