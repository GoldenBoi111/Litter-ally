import { useEffect, useState } from 'react'
import type { TeachingPlan } from './lessonAgent'
import type { TutorStatus } from './hybridTutor'

const CC_KEY = 'litterally-captions'

/** Minimal floating lesson controls plus live captions of what the tutor is saying. Replaces the tutor side panel. */
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

  const last = [...transcript].reverse().find(line => line.role === 'Tutor')
  const live = ['connecting', 'listening', 'speaking', 'drawing'].includes(status)
  const total = plan?.sessions.length || 0
  const checkpoint = plan?.sessions[checkpointIndex]

  return (
    <>
      {captions && (last || detail) && (
        <div className="lesson-captions" role="log" aria-live="polite" aria-label="Tutor captions">
          {last ? <p>{last.text}</p> : <p className="lesson-captions-detail">{detail}</p>}
        </div>
      )}
      <div className="lesson-dock" role="toolbar" aria-label="Lesson controls">
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
            {live && <button
              aria-label="Hold to talk" title="Hold to talk"
              className={micMuted ? '' : 'is-on'}
              onPointerDown={onTalkStart} onPointerUp={onTalkEnd} onPointerLeave={() => { if (!micMuted) onTalkEnd() }}
            >🎙</button>}
            {(live || status === 'paused') && <button aria-label="Stop" onClick={onStop}>■</button>}
          </>
        )}
        <span className="dock-sep" />
        <button aria-pressed={captions} title="Captions" onClick={() => setCaptions(c => !c)}>CC</button>
      </div>
    </>
  )
}
