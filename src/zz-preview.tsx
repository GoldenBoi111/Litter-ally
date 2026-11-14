// TEMPORARY visual preview harness - delete after use.
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import './looseleaf.css'
import './style.css'
import './desk.css'
import './looseleaf-theme.css'
import './pages/pages.css'
import 'tldraw/tldraw.css'
import './board/board.css'
import { Tldraw, createShapeId } from 'tldraw'
import { InkProvider } from './lib/ink/react'
import { Theme } from '@astryxdesign/core/theme'
import { themes, defaultThemeSlug } from './astryx-themes'
import { boardShapeUtils } from './board/shapes'
const a = createShapeId('a'), b = createShapeId('b'), c = createShapeId('c')
ReactDOM.createRoot(document.getElementById('root')!).render(
  <Theme theme={themes[defaultThemeSlug]} mode="light"><InkProvider><div className="board" style={{ position: 'absolute', inset: 0 }}>
    <Tldraw hideUi shapeUtils={boardShapeUtils} onMount={editor => {
      editor.createShapes([
        { id: a, type: 'source-card', x: 40, y: 60, props: { sourceId: 'a', title: 'Attention Is All You Need', kind: 'pdf', segments: 15, summary: 'Introduces the Transformer, replacing recurrence with self-attention for sequence transduction.' } },
        { id: b, type: 'source-card', x: 720, y: 60, meta: { documentRole: 'process' }, props: { sourceId: 'b', title: 'Course rubric and study guide', kind: 'docx', segments: 4, summary: 'Project guide · automatically shapes explanations of content sources.' } },
        { id: c, type: 'source-card', x: 380, y: 320, props: { sourceId: 'c', title: 'A very long source title that should truncate cleanly', kind: 'web', segments: 1, summary: '' } },
      ] as any)
      editor.createShapes([{ type: 'red-string', props: { fromId: a, toId: b, relation: 'contradicts' } }, { type: 'red-string', props: { fromId: a, toId: c, relation: 'supports' } }] as any)
      editor.selectNone()
    }} />
  </div></InkProvider></Theme>,
)
