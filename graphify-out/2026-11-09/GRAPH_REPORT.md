# Graph Report - paper-board  (2026-11-09)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 95 nodes · 134 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f05045f4`
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

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 15 edges
2. `App()` - 10 edges
3. `listPapers()` - 4 edges
4. `savePaper()` - 4 edges
5. `@astryxdesign/core` - 4 edges
6. `react` - 4 edges
7. `scripts` - 4 edges
8. `fetchRemotePdf()` - 3 edges
9. `pinnedPublicAddress()` - 3 edges
10. `openLibrary()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `listPapers()`  [EXTRACTED]
  src/App.tsx → src/storage.ts
- `App()` --calls--> `savePaper()`  [EXTRACTED]
  src/App.tsx → src/storage.ts

## Import Cycles
- None detected.

## Communities (8 total, 1 thin omitted)

### Community 0 - "index.mjs"
Cohesion: 0.12
Nodes (13): express@latest, multer@latest, express, multer, app, createTeachingPlan(), fetchRemotePdf(), pinnedPublicAddress() (+5 more)

### Community 1 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+8 more)

### Community 2 - "package.json"
Cohesion: 0.16
Nodes (15): tldraw@latest, devDependencies, @astryxdesign/cli@^0.7.11, @types/react@latest, @types/react-dom@latest, typescript@latest, name, private (+7 more)

### Community 3 - "dependencies"
Cohesion: 0.14
Nodes (13): dependencies, @astryxdesign/core@^0.7.11, concurrently@latest, ipaddr.js@latest, pdfjs-dist@latest, react@latest, react-dom@latest, @astryxdesign/core (+5 more)

### Community 4 - "App.tsx"
Cohesion: 0.23
Nodes (14): App(), errorMessage(), ImportResult, initializePaperCanvas(), IntakePanel(), IntakePanelProps, placeTeachingPlan(), readApiResult() (+6 more)

### Community 5 - "vite"
Cohesion: 0.40
Nodes (4): vite@latest, @vitejs/plugin-react@latest, vite, @vitejs/plugin-react

### Community 6 - "scripts"
Cohesion: 0.50
Nodes (4): scripts, build, dev, preview

## Knowledge Gaps
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `index.mjs`, `package.json`, `vite`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Should `index.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.12105263157894737 - nodes in this community are weakly interconnected._
- **Why does `@astryxdesign/core` connect `dependencies` to `package.json`, `App.tsx`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Why does `react` connect `dependencies` to `package.json`, `App.tsx`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.14166666666666666 - nodes in this community are weakly interconnected._