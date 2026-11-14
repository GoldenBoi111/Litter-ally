# String board: research synthesis on the notebook canvas

**Status: draft plan.** Pivots the canvas from "one lesson per source" to "one board holding every source", where the AI pins claims and ties them together with red string. Tutoring stays and starts from a selection on the board.

## UI direction (decided)

Notebook first. The only thing borrowed from a detective's string board is the **red string**.

- **Desk + paper stays.** Existing looseleaf theme, Kevin Sans hand fonts, ink grain. No cork, no dark mode, no glow.
- **Source = looseleaf `index-card`.** Title in the header rule, type and two or three key claims on the blue lines.
- **Claim = looseleaf `sticky-note`.** Hung from a small pin near its source card.
- **Connection = red string.** A sagging thread drawn with the ink pen in rule-red, pinned at both ends, with a looseleaf `label-tag` at the middle naming the relation (`supports`, `contradicts`, `extends`). Every link is red string; the tag carries the meaning. `contradicts` tags are stamped, so disagreements read at a glance.
- **Lesson = looseleaf `notebook` page.** "Teach me this" opens a notebook page beside the selected cluster; the existing tutor draws there.
- **Theme groups = `tape` labels.** A strip of tape with the theme name above each group. No boxes.

Not doing: the three-layout switcher, gravity orbs, timeline river, per-card sub-agents, two-agent debate.

## What stays as is

Import pipeline and `SourceLocator`s, IndexedDB library, `learning-agent.mjs` planning/diagnostic/repair, `agent-actions.mjs` validation, voice (`hybridTutor.ts`, `voice_rtc.py`), the ink engine in `src/lib/ink/`.

## Data

No new storage. Card, claim and string shapes carry their data as tldraw shape props, so the existing tldraw persistence saves the board. Claims keep a `SourceRef` (source id + segment ids) so clicking one opens the source at its locator.

`/api/synthesize` response (zod, structured output):

```
themes: { id, name }[]
claims: { id, sourceId, segmentIds[], text, themeId }[]
links:  { from: claimId, to: claimId, kind: 'supports'|'contradicts'|'extends', reason }[]
```

The server rejects claims whose `segmentIds` are not in the request and links whose ends are not claims, before anything reaches the canvas.

## Steps

1. **Add looseleaf pieces.** `npx shadcn add @looseleaf/index-card @looseleaf/sticky-note @looseleaf/label-tag @looseleaf/tape @looseleaf/notebook`. Check the result against the existing `src/lib/ink/` and keep one copy of the ink engine.
2. **One board.** Replace the per-source `persistenceKey` and `key` in `App.tsx` with a single board key. Add a `source-card` shape (index card in an `HTMLContainer`). Importing a source drops its card at the next free spot.
3. **Red string shape.** `string` shape with `fromId`, `toId`, `kind`. It reads both ends' page bounds on each render so it follows dragged cards. The sag curve is a pure function; write one unit test for it. Pins at both ends, label tag at the midpoint.
4. **`/api/synthesize`.** New `server/synthesize.mjs` plus a route in `server/index.mjs`. Input: segments from the board's sources. Output as above, validated. Test with the mocked OpenAI pattern from the existing server tests.
5. **Lay out the result.** A pure `layoutSynthesis(themes, claims, cards)` puts each theme in a column, sticky notes beside their source card, tape label on top; strings created after. One unit test.
6. **Teach me this.** On a selection of cards or notes, run the existing plan → diagnostic → tutor flow with those sources (`selectedSourceIds` already supports several). The lesson draws in a notebook page placed next to the selection, not over the board.
7. **Stretch: counter-evidence.** "Find counter-evidence" on a card uses the existing Exa tool and adds outside sources as cards marked "outside", tied with a `contradicts` string. Needs `EXA_API_KEY`.
8. **Stretch: voice pointer.** While the tutor talks about a claim, move the existing overlay pointer ink to that note.

## Demo script

Drop 5 sources → cards appear → "Synthesize" → notes pin themselves, red strings tie them, one stamped `contradicts` tag stands out → click a note, source opens at the page → select a cluster → "Teach me this" → tutor speaks and draws in the notebook page.

## Risks

- A large source set overflows the synthesize prompt. Shortcut: cap at the first N segments per source and say so in the UI; upgrade to per-source claim extraction first, then cross-source linking, if demos need more than ~10 sources.
- `shadcn add` may overwrite `src/looseleaf.css` or the ink files. Review the diff before keeping it.
