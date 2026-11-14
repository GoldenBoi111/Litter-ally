import { useEffect, useRef, useState } from 'react'
import type { TeachingPlan } from './lessonAgent'
import type { TutorStatus } from './hybridTutor'

const CC_KEY = 'litterally-captions'
const POS_KEY = 'litterally-lesson-bar-pos'

/** Roughly two caption lines: the newest words of what the tutor is saying. */
function captionTail(text: string, max = 150) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(-max)
  return '…' + cut.slice(cut.indexOf(' ') + 1)
}

function useDraggable() {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(POS_KEY) || 'null') } catch { return null }
  })
  const onGripDown = (e: React.PointerEvent) => {
    const el = ref.current, parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return
    e.preventDefault()
    const box = el.getBoundingClientRect(), area = parent.getBoundingClientRect()
    const dx = e.clientX - box.left, dy = e.clientY - box.top
    const move = (ev: PointerEvent) => {
      const x = Math.min(Math.max(0, ev.clientX - area.left - dx), area.width - box.width)
      const y = Math.min(Math.max(0, ev.clientY - area.top - dy), area.height - box.height)
      setPos({ x, y })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setPos(p => { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)); return p })
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const reset = () => { localStorage.removeItem(POS_KEY); setPos(null) }
  return { ref, pos, onGripDown, reset }
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/** Lesson controls (top of the canvas, clear of tldraw's bottom toolbar), live captions, and hold-Space-to-talk. */
export function LessonDock({ plan, planBusy, checkpointIndex, status, detail, micMuted, transcript, onBuild, onStart, onPause, onResume, onStop, onSelectCheckpoint, onTalkStart, onTalkEnd }: {
  plan: TeachingPlan | null
  planBusy: boolean
  checkpointIndex: number
  status: TutorStatus
  detail: string
  micMuted: boolean
  transcript: Array<{ role: 'Tutor' | 'You'; text: string }>
  onBuild: () => void
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onSelectCheckpoint: (index: number) => void
  onTalkStart: () => void
  onTalkEnd: () => void
}) {
  const [captions, setCaptions] = useState(() => localStorage.getItem(CC_KEY) !== 'off')
  useEffect(() => { localStorage.setItem(CC_KEY, captions ? 'on' : 'off') }, [captions])

  const live = ['connecting', 'listening', 'speaking', 'drawing'].includes(status)
  const talking = live && !micMuted
  const spaceHeld = useRef(false)
  const latest = useRef({ live, onTalkStart, onTalkEnd })
  latest.current = { live, onTalkStart, onTalkEnd }

  // Hold Space anywhere on the lesson to talk; it also cuts the tutor off mid-sentence.
  // Capture phase so tldraw's own Space (hand tool) never sees it.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target) || !latest.current.live) return
      e.preventDefault(); e.stopPropagation()
      if (e.repeat || spaceHeld.current) return
      spaceHeld.current = true
      latest.current.onTalkStart()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spaceHeld.current) return
      e.preventDefault(); e.stopPropagation()
      spaceHeld.current = false
      latest.current.onTalkEnd()
    }
    const blur = () => { if (spaceHeld.current) { spaceHeld.current = false; latest.current.onTalkEnd() } }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur) }
  }, [])

  const last = [...transcript].reverse().find(line => line.role === 'Tutor')
  const drag = useDraggable()
  const total = plan?.sessions.length || 0
  const checkpoint = plan?.sessions[checkpointIndex]

  return (
    <>
      <div ref={drag.ref} className={`lesson-bar ${drag.pos ? 'is-placed' : ''}`} style={drag.pos ? { left: drag.pos.x, top: drag.pos.y } : undefined}>
      <div className="lesson-dock" role="toolbar" aria-label="Lesson controls">
        <span className="bar-grip" title="Drag to move · double-click to reset" aria-hidden="true" onPointerDown={drag.onGripDown} onDoubleClick={drag.reset}>⋮⋮</span>
        {!plan ? (
          <button className="dock-primary" disabled={planBusy} onClick={onBuild}>{planBusy ? 'Planning lesson…' : 'Plan this lesson'}</button>
        ) : (
          <>
            <button aria-label="Previous part" disabled={checkpointIndex <= 0} onClick={() => onSelectCheckpoint(checkpointIndex - 1)}>‹</button>
            <span className="dock-step" title={checkpoint?.title}>{checkpointIndex + 1}/{total} · {checkpoint?.title}</span>
            <button aria-label="Next part" disabled={checkpointIndex >= total - 1} onClick={() => onSelectCheckpoint(checkpointIndex + 1)}>›</button>
            <span className="dock-sep" />
            {status === 'paused' ? <button className="dock-primary" onClick={onResume}>Resume</button>
              : live ? <button className="dock-primary" onClick={onPause}>Pause</button>
              : <button className="dock-primary" onClick={onStart}>Start</button>}
            {(live || status === 'paused') && <button aria-label="Stop" onClick={onStop}>■</button>}
          </>
        )}
        <span className="dock-sep" />
        <button aria-pressed={captions} title="Captions" onClick={() => setCaptions(c => !c)}>CC</button>
      </div>

      {live && (
        <button
          className={`talk-pill ${talking ? 'is-talking' : ''} ${status === 'speaking' ? 'tutor-speaking' : ''}`}
          aria-label="Hold to talk (or hold the Space bar)"
          onPointerDown={e => { e.preventDefault(); onTalkStart() }}
          onPointerUp={onTalkEnd}
          onPointerLeave={() => { if (talking && !spaceHeld.current) onTalkEnd() }}
        >
          <span className="talk-orb" aria-hidden="true">
            <i /><i /><i /><i /><i />
          </span>
          {talking
            ? <span className="talk-copy"><b>Listening…</b> release to send</span>
            : <span className="talk-copy"><span className="keycap">Space</span><span><b>Hold to talk</b>{status === 'speaking' ? ' · cuts in anytime' : ' · just speak naturally'}</span></span>}
        </button>
      )}

      </div>

      {captions && (last || detail) && (
        <div className="lesson-captions" role="log" aria-live="polite" aria-label="Tutor captions">
          {last ? <p>{captionTail(last.text)}</p> : <p className="lesson-captions-detail">{detail}</p>}
        </div>
      )}
    </>
  )
}
