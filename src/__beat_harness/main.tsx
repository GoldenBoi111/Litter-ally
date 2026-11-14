import ReactDOM from 'react-dom/client'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import '../intake.css'
import { applyTeachingBeat } from '../lessonAgent'
const w = window as any
function run(editor: Editor) {
  w.editor = editor
  w.runBeat = async () => {
    try {
      const r = await applyTeachingBeat(editor, {
        beatId: 'probe', context: 'probe', speech: 'Here is a loss curve with its slope.', pauseMs: 0, waitForLearner: false, placement: 'new-section', anchorBeatId: '',
        actions: [
          { _type: 'text', id: 'title', atMs: 0, x: 40, y: 40, text: 'Loss L(w)', color: 'black', size: 'l' },
          { _type: 'stroke', id: 'curve', atMs: 100, points: Array.from({ length: 20 }, (_, i) => ({ x: 100 + i * 40, y: 200 + ((i - 10) ** 2) * 3 })), color: 'blue', size: 'm', closed: false },
        ],
      } as any, { lessonId: 'probe', checkpointIndex: 0, signal: new AbortController().signal, pace: 0.2 })
      return { ok: true, r, shapes: editor.getCurrentPageShapes().map(s => ({ type: s.type, x: s.x, y: s.y, props: s.type === 'draw' ? { segs: (s.props as any).segments?.length, color: (s.props as any).color } : s.props })) }
    } catch (e) { return { ok: false, error: String(e && (e as any).stack || e) } }
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<div style={{ position: 'fixed', inset: 0 }} className="canvas-area"><Tldraw onMount={run} /></div>)
