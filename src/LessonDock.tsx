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
export function LessonDock({ plan, planBusy, checkpointIndex, status, detail, micMuted, transcript, onBuild, onAsk, onStart, onPause, onResume, onStop, onSelectCheckpoint, onTalkStart, onTalkEnd }: {
  plan: TeachingPlan | null
  planBusy: boolean
  checkpointIndex: number
  status: TutorStatus
  detail: string
  micMuted: boolean
  transcript: Array<{ role: 'Tutor' | 'You'; text: string }>
  onBuild: () => void
  onAsk: (question: string) => Promise<void>
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onSelectCheckpoint: (index: number) => void
  onTalkStart: () => void
  onTalkEnd: () => void
}) {
  const [captions, setCaptions] = useState(() => localStorage.getItem(CC_KEY) !== 'off')
  const [textOpen, setTextOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
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
  const conceptsById = new Map((plan?.conceptMap || []).map(concept => [concept.id, concept]))
  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    const question = message.trim()
    if (!question || sending || !plan) return
    setSending(true); setSendError('')
    try { await onAsk(question); setMessage('') }
    catch (error) { setSendError(error instanceof Error ? error.message : 'Message could not be sent. Try again.') }
    finally { setSending(false) }
  }

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
            <button aria-expanded={mapOpen} aria-controls="lesson-knowledge-map" onClick={() => { setTextOpen(false); setMapOpen(open => !open) }}>Map</button>
            <span className="dock-sep" />
            {status === 'paused' ? <button className="dock-primary" onClick={onResume}>Resume</button>
              : live ? <button className="dock-primary" onClick={onPause}>Pause</button>
              : <button className="dock-primary" onClick={onStart}>Start</button>}
            {(live || status === 'paused') && <button aria-label="Stop" onClick={onStop}>■</button>}
          </>
        )}
        <span className="dock-sep" />
        <button aria-pressed={captions} title="Captions" onClick={() => setCaptions(c => !c)}>CC</button>
        <button aria-expanded={textOpen} aria-controls="lesson-text-chat" onClick={() => { setMapOpen(false); setTextOpen(open => !open) }}>Text</button>
      </div>

      {mapOpen && plan && <section id="lesson-knowledge-map" className="lesson-map" aria-label="Lesson knowledge map">
        <header className="lesson-map-header">
          <div><strong>Lesson map</strong><span>{checkpointIndex + 1} of {total}</span></div>
          <button aria-label="Close lesson map" onClick={() => setMapOpen(false)}>×</button>
        </header>
        <ol className="lesson-map-steps">
          {plan.sessions.map((session, index) => {
            const current = index === checkpointIndex
            const concepts = session.conceptIds?.map(id => conceptsById.get(id)).filter((item): item is NonNullable<typeof plan.conceptMap>[number] => Boolean(item)) || []
            const fallbackConcepts = concepts.length ? [] : session.concepts
            const edges = concepts.flatMap(concept => concept.prerequisites.flatMap(link => {
              const prerequisite = conceptsById.get(link.id)
              return prerequisite ? [`${prerequisite.name} → ${concept.name}`] : []
            }))
            return <li key={`${index}-${session.title}`} className={current ? 'is-current' : index < checkpointIndex ? 'is-earlier' : ''}>
              <button className="lesson-map-step" aria-current={current ? 'step' : undefined} onClick={() => onSelectCheckpoint(index)}>
                <span className="lesson-map-step-head"><span className="lesson-map-number">{index + 1}</span><strong>{session.title}</strong><span className="lesson-map-state">{current ? 'Here' : index < checkpointIndex ? 'Earlier' : index === checkpointIndex + 1 ? 'Next' : ''}</span></span>
                <span className="lesson-map-concepts">{concepts.map(concept => <span className="lesson-map-node" key={concept.id}>{concept.name}</span>)}{fallbackConcepts.map(concept => <span className="lesson-map-node" key={concept}>{concept}</span>)}</span>
                {current && <span className="lesson-map-focus"><b>Look out for</b> {session.pageFocus || session.goal}</span>}
                {edges.length > 0 && <span className="lesson-map-links">{edges.map(edge => <span key={edge}>{edge}</span>)}</span>}
              </button>
            </li>
          })}
        </ol>
      </section>}

      {textOpen && <section id="lesson-text-chat" className="lesson-text-chat" aria-label="Text conversation with tutor">
        <ol className="lesson-text-history" role="log" aria-live="polite">
          {transcript.length ? transcript.map((line, index) => <li className={line.role === 'You' ? 'from-learner' : ''} key={`${index}-${line.text}`}><b>{line.role === 'You' ? 'You' : 'Tutor'}</b><p>{line.text}</p></li>) : <li className="text-chat-empty">{plan ? 'Ask the tutor a question.' : 'Plan a lesson to start a text conversation.'}</li>}
        </ol>
        {sendError && <p className="lesson-text-error" role="alert">{sendError}</p>}
        <form className="lesson-text-form" onSubmit={sendMessage}>
          <label className="lesson-text-label" htmlFor="lesson-text-message">Message the tutor</label>
          <textarea id="lesson-text-message" value={message} onChange={event => setMessage(event.target.value)} placeholder="Ask a question…" rows={2} disabled={!plan || sending} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
          <button type="submit" disabled={!plan || !message.trim() || sending}>{sending ? 'Sending…' : 'Send'}</button>
        </form>
        <span className="lesson-text-hint">Enter to send · Shift+Enter for a new line</span>
      </section>}

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

      {status === 'error' && detail ? (
        // Start failures (e.g. a blocked microphone) must be visible even with captions off, or Start just looks like it reset.
        <div className="lesson-captions" role="alert">
          <p className="lesson-captions-detail">{detail}</p>
        </div>
      ) : captions && (last || detail) && (
        <div className="lesson-captions" role="log" aria-live="polite" aria-label="Tutor captions">
          {last ? <p>{captionTail(last.text)}</p> : <p className="lesson-captions-detail">{detail}</p>}
        </div>
      )}
    </>
  )
}
