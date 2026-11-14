import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { DefaultStylePanel, toRichText, useEditor, useValue, type Editor, type TLUiStylePanelProps } from 'tldraw'
import 'tldraw/tldraw.css'
import { latestConceptEvidence, listPapers, loadKnowledgeGraph, loadLearningProfile, paperCanvasPersistenceKey, readApiJson, recordPlanKnowledge, saveLearningPlan, savePaper, type ImportedPaper, type LearningEvidence } from './storage'
import { readPaperEvidence, readPaperPage } from './paper-text.mjs'
import { applyDiagramPlan, applyTeachingBeat, buildCheckpointBrief, formatCheckpointBrief, getSelectionContext, getTeachingExecutionState, getWhiteboardContext, requestDiagramPlan, type DiagramBrief, type TeachingBeat, type TeachingPlan } from './lessonAgent'
import { mergeCourseJob, readCourseJob, requestAdaptivePlan, requestAdaptiveRevision, requestDiagnosticTurn, requestFastPlan, shareDiagnosticWithPlanner, defaultLearningGoal, type DiagnosticTurn } from './learning'
import { AIMD, languageGuide, nextLevel, readLearnerSignal, type AimdSignal } from './aimd'
import { DiagnosticChat } from './DiagnosticChat'
import { finishPdfExtraction, type PdfExtraction } from './pdfImport'
import { importImageSource, importMediaSource, importTextSource } from './sourceImport'
import { placeSourceImage } from './sourceImage'
import { LessonDock } from './LessonDock'
import { PaperLoader } from './PaperLoader'
import { Board } from './board/Board'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectOverview } from './pages/ProjectOverview'
import './pages/pages.css'
import { COMPARE_GOAL, DEEP_GOAL, loadProjects, newProject, projectBoardKey, projectSynthesisKey, saveProjects, summarizeSource, synthesizeProject, type Project, isCurrentSummary } from './projects'
import { PersistentTldraw } from './persistentCanvas'
import { lessonShapeUtils } from './lessonWidgets'
import { Wordmark } from './Logo'
import { AccountSettings } from './AccountSettings'
import type { User } from './AuthGate'
import type { HybridTutor, TutorCallbacks, TutorStatus } from './hybridTutor'

type ImportResult = Omit<ImportedPaper, 'id' | 'importedAt'>
type ApiImportResult = Omit<ImportResult, 'pdfData'> & { pdfBase64?: string; scannedPages?: number[] }
type IntakePanelProps = {
  busy: boolean
  progress: string
  error: string
  onFiles: (files: File[]) => void
  onUrl: (url: string) => void
  onTopic: (topic: string) => void
}

const CURRENT_PAPER_KEY = 'margin-library:current-paper'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
type View = 'projects' | 'overview' | 'board' | 'lesson'

function readRoute() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] === 'projects' && parts[1]) return {
    view: parts[2] === 'sources' ? 'overview' as View : parts[2] === 'lesson' ? 'lesson' as View : 'board' as View,
    projectId: parts[1], sourceId: parts[2] === 'lesson' ? parts[3] || null : null,
  }
  if (parts[0] === 'lesson') return { view: 'lesson' as View, projectId: null, sourceId: parts[1] || null }
  return { view: 'projects' as View, projectId: null, sourceId: null }
}

function routePath(view: View, projectId: string | null, sourceId: string | null) {
  if (view === 'projects' || !projectId) return view === 'lesson' && sourceId ? `/lesson/${encodeURIComponent(sourceId)}` : '/projects'
  return `/projects/${encodeURIComponent(projectId)}${view === 'board' ? '' : view === 'overview' ? '/sources' : `/lesson/${encodeURIComponent(sourceId || '')}`}`
}

function combineLearningSources(sources: ImportedPaper[]) {
  const segments = sources.flatMap(source => (source.sourceSegments || []).map(segment => ({ ...segment, sourceId: source.id, sourceTitle: source.title })))
  const text = sources.length === 1
    ? sources[0].text
    : segments.map((segment, index) => `[Page ${index + 1} of ${segments.length}]\n[Source: ${segment.sourceTitle} · ${segment.locator.kind}]\n${segment.text}`).join('\n\n')
  return { segments, text }
}

/** Style controls appear only while something is selected or a drawing tool is active. */
function PaperStylePanel({ isMobile, styles }: TLUiStylePanelProps) {
  const editor = useEditor()
  const show = useValue('show style panel', () => editor.getSelectedShapeIds().length > 0 || !['select', 'hand', 'laser', 'zoom'].includes(editor.getCurrentToolId()), [editor])
  return isMobile || show ? <DefaultStylePanel isMobile={isMobile} styles={styles} /> : null
}

// Lesson canvas keeps only the drawing toolbar; tldraw's menus, page picker and zoom readout are hidden.
const paperCanvasComponents = { StylePanel: PaperStylePanel, MenuPanel: null, NavigationPanel: null, HelperButtons: null, DebugMenu: null, DebugPanel: null }

function IntakePanel({ busy, progress, error, onFiles, onUrl, onTopic }: IntakePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'file' | 'link' | 'topic'>('file')
  const [url, setUrl] = useState('')
  const [topic, setTopic] = useState('')
  const [dragging, setDragging] = useState(false)

  return (
    <div className="intake-panel">
      <Tabs value={mode} onValueChange={value => setMode(value as 'file' | 'link')} className="intake-tabs">
        <TabsList aria-label="Choose learning material" className="intake-tabs-list h-auto w-full justify-start gap-1 rounded-none border-b border-border p-0">
          <TabsTrigger value="file" className="intake-tab h-8 flex-none px-2 py-1 text-xs">File</TabsTrigger>
          <TabsTrigger value="link" className="intake-tab h-8 flex-none px-2 py-1 text-xs">Link</TabsTrigger>
          <TabsTrigger value="topic" className="intake-tab h-8 flex-none px-2 py-1 text-xs">Topic</TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === 'file' ? (
        <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); onFiles(Array.from(event.dataTransfer.files)) }}>
          <input ref={inputRef} className="file-input" type="file" accept=".pdf,.txt,.md,.markdown,.csv,.pptx,.xlsx,.ts,.tsx,.js,.jsx,.mjs,.py,.java,.go,.rs,.c,.h,.cpp,.cs,.rb,.php,.sh,.sql,.json,.yaml,.yml,.toml,.xml,image/*,audio/*,video/*" multiple aria-label="Choose learning material files" onChange={event => { if (event.currentTarget.files) onFiles(Array.from(event.currentTarget.files)); event.currentTarget.value = '' }} />
          <div className="upload-symbol">+</div>
          <b>{dragging ? 'Drop files to import' : 'Drop learning material here'}</b>
          <span>or <button type="button" className="browse-link" onClick={() => inputRef.current?.click()}>choose files</button></span>
        </div>
      ) : mode === 'link' ? (
        <form className="url-form" onSubmit={event => { event.preventDefault(); onUrl(url) }}>
          <label htmlFor="paper-url-modal">Paste a public link</label>
          <div className="url-control"><Input id="paper-url-modal" type="url" autoComplete="url" inputMode="url" required placeholder="https://example.com/document.pdf" value={url} onChange={event => setUrl(event.target.value)} /><Button type="submit" size="icon-sm" disabled={busy || !url.trim()} aria-label="Add source">+</Button></div>
        </form>
      ) : (
        <form className="url-form" onSubmit={event => { event.preventDefault(); onTopic(topic) }}>
          <label htmlFor="learning-topic">What do you want to understand?</label>
          <div className="url-control"><Input id="learning-topic" required maxLength={300} placeholder="e.g. how mRNA vaccines work" value={topic} onChange={event => setTopic(event.target.value)} /><Button type="submit" size="sm" className="url-submit-wide" disabled={busy || !topic.trim()}>Start</Button></div>
        </form>
      )}
      {busy && <div className="import-progress" role="status"><span className="spinner" /> {progress || 'Preparing material...'}</div>}
      {error && <div className="import-error" role="alert"><b>Could not import that source</b><span>{error}</span></div>}
    </div>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

async function readApiResult(response: Response | Promise<Response>, localPdf?: Blob): Promise<PdfExtraction> {
  const result = await readApiJson<ApiImportResult>(response, 'The import service')
  const { pdfBase64, scannedPages, ...paper } = result as ApiImportResult
  if (localPdf) return { ...paper, pdfData: localPdf, scannedPages }
  if (typeof pdfBase64 !== 'string') {
    if (paper.sourceKind && paper.sourceSegments) return { ...paper, scannedPages: [] }
    throw new Error('The import service returned no source data.')
  }
  const binary = atob(pdfBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return { ...paper, pdfData: new Blob([bytes], { type: 'application/pdf' }), scannedPages }
}

function initializePaperCanvas(editor: Editor, paper: ImportedPaper) {
  if (editor.getCurrentPageShapes().length) return
  editor.createShapes([
    { type: 'text', x: 0, y: 0, props: { richText: toRichText(paper.title), color: 'black', size: 'l', font: 'serif' } },
  ] as any)
  const bounds = editor.getCurrentPageBounds()
  if (bounds) editor.zoomToBounds(bounds, { targetZoom: 1, animation: { duration: 0 } })
}

export default function App({ user, onUserUpdated, onSignOut, notice }: { user: User; onUserUpdated: (user: User) => void; onSignOut: () => void; notice?: string }) {
  const editorRef = useRef<Editor | null>(null)
  const modalRef = useRef<HTMLDialogElement>(null)
  const planRef = useRef<TeachingPlan | null>(null)
  const checkpointIndexRef = useRef(0)
  const tutorRef = useRef<HybridTutor | null>(null)
  const drawAbortRef = useRef<AbortController | null>(null)
  /** Diagrams draw in the background while beats run, so they get their own abort handle. */
  const diagramAbortRef = useRef<AbortController | null>(null)
  const agentCursorRef = useRef<HTMLDivElement>(null)
  const agentCursorHideRef = useRef<number | undefined>(undefined)
  const selectionCleanupRef = useRef<(() => void) | null>(null)
  const [papers, setPapers] = useState<ImportedPaper[]>([])
  const [route] = useState(readRoute)
  const routeSourceId = useRef(route.sourceId)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [libraryReady, setLibraryReady] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [view, setView] = useState<View>(route.view)
  const [accountOpen, setAccountOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const [activeProjectId, setActiveProjectId] = useState<string | null>(route.projectId)
  const activeProject = projects.find(p => p.id === activeProjectId) || null
  const [pendingSummaries, setPendingSummaries] = useState<Set<string>>(new Set())
  const [analysisError, setAnalysisError] = useState<{ projectId: string; message: string } | null>(null)
  const [analysisRetry, setAnalysisRetry] = useState(0)
  const lessonEntryRef = useRef<{ primary: string; extra: string[]; goal: string } | null>(null)
  const [pendingGoal, setPendingGoal] = useState<{ goal: string; extra: string[] } | null>(null)
  const openAdd = useCallback(() => { setError(''); setAddOpen(true) }, [])
  const updateProjects = useCallback((update: (list: Project[]) => Project[]) => {
    const next = update(projectsRef.current)
    projectsRef.current = next
    setProjects(next)
    saveProjects(next).catch(reason => setError(errorMessage(reason)))
  }, [])
  const activeProjectIdRef = useRef(activeProjectId)
  activeProjectIdRef.current = activeProjectId
  const navigate = useCallback((next: View, projectId = activeProjectId, sourceId = currentId) => {
    window.history.pushState({}, '', routePath(next, projectId, sourceId))
    setView(next)
    setActiveProjectId(projectId)
    if (next === 'lesson' && sourceId) setCurrentId(sourceId)
  }, [activeProjectId, currentId])
  useEffect(() => {
    const onPopState = () => {
      const next = readRoute()
      setView(next.view)
      setActiveProjectId(next.projectId)
      if (next.sourceId) setCurrentId(next.sourceId)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const [returnView, setReturnView] = useState<View>('overview')
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const startGuidedLesson = (extra: string[], goal: string) => {
    setSelectedSourceIds(extra)
    planRef.current = null
    setPlan(null)
    checkpointIndexRef.current = 0
    setCheckpointIndex(0)
    tutorRef.current?.close()
    tutorRef.current = null
    setTranscript([])
    setTutorStatus('idle')
    setPendingGoal({ goal, extra })
  }
  const enterLesson = (primary: string, extra: string[], goal: string | null) => {
    setReturnView(view === 'lesson' ? returnView : view)
    navigate('lesson', activeProjectId, primary)
    if (!goal) { setCurrentId(primary); return }
    if (primary === currentId) startGuidedLesson(extra, goal)
    else { lessonEntryRef.current = { primary, extra, goal }; setCurrentId(primary) }
  }
  const titleOf = (id: string) => papers.find(p => p.id === id)?.title || 'Source'
  const openLesson = (sourceId: string) => {
    if (papers.find(paper => paper.id === sourceId)?.documentRole === 'process') { setStatus('This process document guides lessons on content sources in the project.'); return }
    enterLesson(sourceId, [], null)
  }
  const openCompare = (a: string, b: string) => enterLesson(a, [b], COMPARE_GOAL(titleOf(a), titleOf(b)))
  const projectSources = activeProject ? activeProject.sourceIds.map(id => papers.find(p => p.id === id)).filter((p): p is ImportedPaper => Boolean(p)) : []
  const contentSources = projectSources.filter(paper => paper.documentRole !== 'process')
  const openDeep = () => {
    if (!activeProject || !contentSources.length) return
    const [first, ...rest] = contentSources.map(p => p.id)
    enterLesson(first, rest, DEEP_GOAL(activeProject.name))
  }
  const projectSummaries = useMemo(() => Object.fromEntries(Object.entries(activeProject?.summaries || {}).map(([id, s]) => [id, s.summary || s.tidbit])), [activeProject])
  const contentProject = activeProject ? { ...activeProject, sourceIds: contentSources.map(paper => paper.id), summaries: Object.fromEntries(contentSources.flatMap(paper => activeProject.summaries[paper.id] ? [[paper.id, activeProject.summaries[paper.id]]] : [])) } : null
  const projectSynthesisCurrent = !!contentProject && contentProject.synthesisFor === projectSynthesisKey(contentProject)
  const projectAnalysisStatus = activeProject && contentSources.some(paper => !isCurrentSummary(activeProject.summaries[paper.id]))
    ? 'Reading sources…'
    : activeProject && contentSources.length > 1 && !projectSynthesisCurrent ? 'Finding connections…' : null
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [planBusy, setPlanBusy] = useState(false)
  // Hybrid planning: after checkpoint 1 arrives, a background job plans checkpoints 2..N (server/deep-course).
  type CourseJob = { jobId: string; paperId: string; status: 'running' | 'done' | 'failed' }
  const courseJobRef = useRef<CourseJob | null>(null)
  const [courseJob, setCourseJob] = useState<CourseJob | null>(null)
  const trackCourseJob = useCallback((job: CourseJob | null) => { courseJobRef.current = job; setCourseJob(job) }, [])
  // Set when the learner clears the last checkpoint we have while the rest of the course is still being planned.
  const awaitingNextRef = useRef(false)
  // AIMD language level (1 everyday .. 10 technical), per learner and source; steers how technical the tutor speaks.
  const [languageLevel, setLanguageLevel] = useState<number>(AIMD.start)
  const languageLevelRef = useRef<number>(AIMD.start)
  // The diagnostic agent's conversation, shown while checkpoint 1 is planned.
  type DiagnosticChatState = { paperId: string; turns: DiagnosticTurn[]; busy: boolean; done: boolean; summary: string; error: string }
  const [diagnosticChat, setDiagnosticChat] = useState<DiagnosticChatState | null>(null)
  const diagnosticChatRef = useRef<DiagnosticChatState | null>(null)
  const updateDiagnosticChat = useCallback((next: DiagnosticChatState | null) => { diagnosticChatRef.current = next; setDiagnosticChat(next) }, [])
  // A finished diagnostic waiting for the background job id, so its findings still reach the planner.
  const diagnosticResultRef = useRef<{ paperId: string; summary: string } | null>(null)
  const lastLearnerLineRef = useRef('')
  const [plan, setPlan] = useState<TeachingPlan | null>(null)
  const [checkpointIndex, setCheckpointIndex] = useState(0)
  const [tutorStatus, setTutorStatus] = useState<TutorStatus>('idle')
  const [tutorMicMuted, setTutorMicMuted] = useState(true)
  const [tutorDetail, setTutorDetail] = useState('')
  const [transcript, setTranscript] = useState<Array<{ role: 'Tutor' | 'You'; text: string }>>([])
  const transcriptRef = useRef(transcript)
  const checkpointTranscriptStartRef = useRef(0)
  transcriptRef.current = transcript
  const [knowledgeGraph, setKnowledgeGraph] = useState<Awaited<ReturnType<typeof loadKnowledgeGraph>>>({ nodes: [], edges: [] })
  const knowledgeGraphRef = useRef(knowledgeGraph)
  knowledgeGraphRef.current = knowledgeGraph
  const [learnerEvidence, setLearnerEvidence] = useState<LearningEvidence[]>([])
  const learnerEvidenceRef = useRef(learnerEvidence)
  learnerEvidenceRef.current = learnerEvidence
  const learnerKnowledge = useMemo(() => latestConceptEvidence(learnerEvidence), [learnerEvidence])
  const [status, setStatus] = useState(notice || 'Your library is saved to your account')

  const showAgentCursor = useCallback((point: { x: number; y: number }) => {
    const cursor = agentCursorRef.current
    const editor = editorRef.current
    if (!cursor || !editor) return
    window.clearTimeout(agentCursorHideRef.current)
    const viewportPoint = editor.pageToViewport(point)
    cursor.style.transform = `translate(${viewportPoint.x}px, ${viewportPoint.y}px)`
    cursor.classList.remove('is-leaving')
    cursor.hidden = false
  }, [])
  const hideAgentCursor = useCallback(() => {
    const cursor = agentCursorRef.current
    if (!cursor) return
    cursor.classList.add('is-leaving')
    window.clearTimeout(agentCursorHideRef.current)
    agentCursorHideRef.current = window.setTimeout(() => { cursor.hidden = true }, 220)
  }, [])

  const currentPaper = useMemo(() => {
    const primary = papers.find(paper => paper.id === currentId)
    if (!primary) return null
    const ids = [...new Set([primary.id, ...selectedSourceIds])]
    const sources = ids.map(id => papers.find(paper => paper.id === id)).filter((paper): paper is ImportedPaper => Boolean(paper))
    const { segments, text } = combineLearningSources(sources)
    return {
      ...primary,
      sourceKind: sources.length === 1 ? primary.sourceKind : 'text',
      title: sources.length === 1 ? primary.title : sources.map(source => source.title).join(' + '),
      pageCount: segments.length,
      characterCount: text.length,
      text,
      sourceSegments: segments,
    }
  }, [papers, currentId, selectedSourceIds])

  useEffect(() => {
    listPapers().then(items => {
      setPapers(items)
      const rememberedId = localStorage.getItem(CURRENT_PAPER_KEY)
      const initialId = routeSourceId.current
      setCurrentId(items.some(item => item.id === initialId) ? initialId : items.some(item => item.id === rememberedId) ? rememberedId : items[0]?.id || null)
      setLibraryReady(true)
    }).catch(reason => {
      setError(errorMessage(reason))
      setLibraryReady(true)
    })
  }, [])

  useEffect(() => {
    Promise.all([loadKnowledgeGraph(), loadLearningProfile()]).then(([graph, profile]) => {
      knowledgeGraphRef.current = graph
      setKnowledgeGraph(graph)
      learnerEvidenceRef.current = profile.evidence
      setLearnerEvidence(profile.evidence)
      const activePlan = planRef.current
      if (activePlan) tutorRef.current?.updateCheckpointBrief(buildCheckpointBrief(activePlan, checkpointIndexRef.current, graph, profile.evidence, currentPaper?.pageCount))
    }).catch(reason => setError(errorMessage(reason)))
  }, [])

  useEffect(() => {
    if (currentId) localStorage.setItem(CURRENT_PAPER_KEY, currentId)
    else localStorage.removeItem(CURRENT_PAPER_KEY)
    drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
    tutorRef.current?.close()
    tutorRef.current = null
    const saved = papers.find(paper => paper.id === currentId)?.lessonState
    const savedSourceIds = saved?.sourceIds?.filter(id => id !== currentId && papers.some(paper => paper.id === id)) || []
    const selectedSources = [papers.find(paper => paper.id === currentId), ...savedSourceIds.map(id => papers.find(paper => paper.id === id))].filter((paper): paper is ImportedPaper => Boolean(paper))
    const combined = combineLearningSources(selectedSources)
    const missingLessonSource = Boolean(saved?.sourceIds?.some(id => !papers.some(paper => paper.id === id))) || combined.segments.length > 300 || combined.text.length > 1_500_000
    setSelectedSourceIds(missingLessonSource ? [] : savedSourceIds)
    const restored = !missingLessonSource && saved?.plan.sessions.every(checkpoint => Array.isArray(checkpoint.sourcePages) && typeof checkpoint.pageFocus === 'string') ? saved : undefined
    const restoredIndex = restored ? Math.max(0, Math.min(restored.plan.sessions.length - 1, restored.checkpointIndex)) : 0
    planRef.current = restored?.plan || null
    checkpointIndexRef.current = restoredIndex
    setPlan(restored?.plan || null)
    setCheckpointIndex(restoredIndex)
    setTranscript([])
    setTutorStatus('idle')
    setTutorMicMuted(true)
    setTutorDetail(missingLessonSource ? 'A source used by this saved lesson was removed. Rebuild the plan to continue.' : saved && !restored ? 'This lesson predates page-grounded teaching. Rebuild it to continue.' : '')
    const entry = lessonEntryRef.current
    if (entry && entry.primary === currentId) { lessonEntryRef.current = null; startGuidedLesson(entry.extra, entry.goal) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId])

  const persistLessonState = useCallback(async (nextPlan: TeachingPlan, nextCheckpoint: number, resetAssessments = false, targetPaper = currentPaper) => {
    if (!targetPaper) return
    const savedPaper = papers.find(paper => paper.id === targetPaper.id) || targetPaper
    const updated = {
      ...savedPaper,
      lessonState: { plan: nextPlan, checkpointIndex: nextCheckpoint, sourceIds: [targetPaper.id, ...selectedSourceIds.filter(id => id !== targetPaper.id)] },
      ...(resetAssessments && savedPaper.learningState ? { learningState: { ...savedPaper.learningState, assessments: {} } } : {}),
    }
    setPapers(existing => existing.map(paper => paper.id === updated.id ? updated : paper))
    try {
      await savePaper(updated)
    } catch {
      setStatus('The lesson is active, but its latest checkpoint could not be saved.')
    }
  }, [currentPaper, papers, selectedSourceIds])

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden && tutorRef.current) {
        drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
        tutorRef.current.pause()
        setTutorDetail('Paused while this tab is hidden. Return here and press Resume to continue.')
      }
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden)
  }, [])

  useEffect(() => () => {
    drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
    tutorRef.current?.close()
    selectionCleanupRef.current?.()
  }, [])

  useEffect(() => {
    const dialog = modalRef.current
    if (!dialog) return
    if (addOpen && !dialog.open) dialog.showModal()
    if (!addOpen && dialog.open) dialog.close()
  }, [addOpen])

  const saveImport = useCallback(async (result: ImportResult) => {
    let roleSummary: Awaited<ReturnType<typeof summarizeSource>> | undefined
    if (result.sourceKind !== 'topic' && result.text.trim()) {
      try { roleSummary = await summarizeSource({ ...result, id: '', importedAt: '' }) }
      catch { /* Classification is advisory; imports remain usable as content when the model is unavailable. */ }
    }
    const paper: ImportedPaper = { ...result, documentRole: roleSummary?.documentRole || 'content', id: crypto.randomUUID(), importedAt: new Date().toISOString() }
    await savePaper(paper)
    setPapers(existing => [paper, ...existing])
    const projectId = activeProjectIdRef.current
    if (projectId) updateProjects(list => list.map(p => p.id === projectId ? {
      ...p, sourceIds: [...new Set([...p.sourceIds, paper.id])],
      summaries: paper.documentRole === 'process' || !roleSummary ? p.summaries : { ...p.summaries, [paper.id]: roleSummary },
    } : p))
    setAnalysisError(null)
    setCurrentId(paper.id)
    setStatus(paper.sourceKind === 'topic' ? `Started a lesson on "${paper.title}"` : `Imported "${paper.title}" - ${paper.pageCount} segments`)
    setError('')
  }, [updateProjects])

  const createTopicLesson = useCallback(async (value: string) => {
    const topic = value.trim()
    if (!topic) return
    setBusy(true)
    setError('')
    try {
      await saveImport({
        title: topic, sourceUrl: '', pdfUrl: '', fileName: topic, pageCount: 1, characterCount: topic.length,
        text: `[Page 1 of 1]\nLearner topic: ${topic}`, sourceKind: 'topic',
        sourceSegments: [{ id: `topic:${crypto.randomUUID()}`, text: `Learner topic: ${topic}`, locator: { kind: 'section', heading: 'Learner topic' } }],
      })
      setAddOpen(false)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }, [saveImport])

  const importFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    setError('')
    let imported = 0
    const failures: string[] = []
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index]
        setProgress(files.length > 1 ? `Reading file ${index + 1} of ${files.length}...` : 'Extracting source text...')
        if (file.size > MAX_UPLOAD_BYTES) {
          failures.push(`${file.name}: it exceeds the 25 MB limit.`)
          continue
        }
        try {
          const textSource = await importTextSource(file)
          if (textSource) {
            await saveImport(textSource)
            imported++
            continue
          }
          if (file.type.startsWith('image/')) setProgress(`Recognizing ${file.name} locally…`)
          const imageSource = await importImageSource(file)
          if (imageSource) {
            await saveImport(imageSource)
            imported++
            continue
          }
          const mediaSource = await importMediaSource(file, setProgress)
          if (mediaSource) {
            await saveImport(mediaSource)
            imported++
            continue
          }
          if (/\.(pptx|xlsx)$/i.test(file.name)) {
            const form = new FormData()
            form.append('file', file)
            const extracted = await readApiJson<ApiImportResult>(fetch('/api/ingest/office', { method: 'POST', body: form }), 'The import service')
            await saveImport({ ...extracted, sourceData: file } as ImportResult)
            imported++
            continue
          }
          if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            failures.push(`${file.name}: this format is not supported yet. Choose PDF, text, Markdown, CSV, PowerPoint, Excel, an image, audio, video, or a code file.`)
            continue
          }
          const form = new FormData()
          form.append('file', file)
      const extraction = await readApiResult(fetch('/api/ingest', { method: 'POST', body: form }), file)
          const result = await finishPdfExtraction(extraction, setProgress)
          await saveImport({ ...result, fileName: file.name })
          imported++
        } catch (reason) {
          failures.push(`${file.name}: ${errorMessage(reason)}`)
        }
      }
      if (imported) setAddOpen(false)
      if (failures.length) setError(failures.slice(0, 3).join(' '))
      if (imported && !failures.length) setStatus(imported === 1 ? 'Material imported and saved on this device' : `${imported} materials imported and saved on this device`)
    } finally {
      setBusy(false)
      setProgress('')
    }
  }, [saveImport])

  const importUrl = useCallback(async (url: string) => {
    setBusy(true)
    setError('')
    setProgress('Fetching source text...')
    try {
      const extraction = await readApiResult(fetch('/api/ingest/web', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
      }))
      const result = extraction.pdfData ? await finishPdfExtraction(extraction, setProgress) : extraction
      await saveImport(result)
      setAddOpen(false)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
      setProgress('')
    }
  }, [saveImport])

  const onCanvasDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length) { void importFiles(files); return }
  }

  const drawDiagram = useCallback(async (diagramIndex: number, request = '', index = checkpointIndexRef.current) => {
    const editor = editorRef.current
    const activePlan = planRef.current
    if (!currentPaper || !editor || !activePlan) return 'No lesson is ready.'
    const checkpoint = activePlan.sessions[index]
    if (!checkpoint) return 'That checkpoint does not exist.'

    diagramAbortRef.current?.abort()
    const controller = new AbortController()
    diagramAbortRef.current = controller
    try {
      const preparedDiagram = checkpoint.diagrams[diagramIndex]
      const customRequest = request.trim().slice(0, 600)
      if (!preparedDiagram && !customRequest) return `Diagram ${diagramIndex + 1} does not exist in this checkpoint.`
      const diagram: DiagramBrief = customRequest
        ? { title: 'Learner requested visual', purpose: customRequest, kind: preparedDiagram?.kind ?? 'concept-map' }
        : preparedDiagram!
      const canvasDiagramIndex = customRequest ? checkpoint.diagrams.length : diagramIndex
      setTutorDetail(`Planning "${diagram.title}"...`)
      const diagramPlan = await requestDiagramPlan({ title: currentPaper.title, checkpoint, diagram, signal: controller.signal })
      setTutorDetail(`Drawing "${diagram.title}"...`)
      await applyDiagramPlan(editor, diagramPlan, {
        lessonId: currentPaper.id,
        checkpointIndex: index,
        diagramIndex: canvasDiagramIndex,
        diagramKind: diagram.kind,
        signal: controller.signal,
        onAction: setTutorDetail,
        onCursor: showAgentCursor,
      })
      setTutorDetail(`"${diagram.title}" is ready.`)
      return `Completed "${diagram.title}".`
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return 'Drawing paused. Existing partial work remains on the canvas.'
      const message = errorMessage(reason)
      setTutorStatus('error')
      setTutorDetail(message)
      throw reason
    } finally {
      hideAgentCursor()
    }
  }, [currentPaper, hideAgentCursor, showAgentCursor])

  const presentTeachingBeat = useCallback(async (beat: TeachingBeat) => {
    const editor = editorRef.current
    if (!currentPaper || !editor) throw new Error('No source canvas is ready.')
    drawAbortRef.current?.abort()
    const controller = new AbortController()
    drawAbortRef.current = controller
    setTutorStatus('drawing')
    setTutorDetail(beat.context)
    try {
      return await applyTeachingBeat(editor, beat, {
        lessonId: currentPaper.id,
        checkpointIndex: checkpointIndexRef.current,
        signal: controller.signal,
        onAction: setTutorDetail,
        onCursor: showAgentCursor,
      })
    } finally {
      hideAgentCursor()
    }
  }, [currentPaper, hideAgentCursor, showAgentCursor])

  const showSourcePage = useCallback(async (pageNumber: number) => {
    const editor = editorRef.current
    if (!currentPaper || !editor) return { message: 'No source canvas is ready.' }
    const segment = currentPaper.sourceSegments?.[pageNumber - 1]
    const source = papers.find(paper => paper.id === segment?.sourceId) || currentPaper
    const sourceSegmentIndex = segment ? (source.sourceSegments || []).findIndex(item => item.id === segment.id) : pageNumber - 1
    if (source.sourceKind === 'image' && source.sourceData) {
      drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
      const controller = new AbortController()
      drawAbortRef.current = controller
      return placeSourceImage(editor, source.sourceData, source.id, source.title, checkpointIndexRef.current, controller.signal)
    }
    const sourceFrames = source.sourceFrames
    if (source.sourceKind === 'video' && sourceFrames?.length) {
      const sourceLocator = segment?.locator
      const frameSeconds = sourceLocator?.kind === 'time-range' ? sourceLocator.frameSeconds : undefined
      const frame = sourceFrames.reduce((closest, candidate) => Math.abs(candidate.timeSeconds - (frameSeconds || 0)) < Math.abs(closest.timeSeconds - (frameSeconds || 0)) ? candidate : closest)
      drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
      const controller = new AbortController()
      drawAbortRef.current = controller
      return placeSourceImage(editor, frame.data, source.id, `${source.title} · ${Math.round(frame.timeSeconds)} seconds`, checkpointIndexRef.current, controller.signal, `frame-${pageNumber}`)
    }
    if (source.sourceKind === 'slides' && source.sourceData && sourceSegmentIndex >= 0) {
      const form = new FormData()
      form.append('slide', String(sourceSegmentIndex + 1))
      form.append('file', source.sourceData, source.fileName)
      const { image } = await readApiJson<{ image: { mimeType: string; data: string } | null }>(fetch('/api/ingest/office/slide-image', { method: 'POST', body: form }), 'The PowerPoint importer')
      if (image) {
        const bytes = Uint8Array.from(atob(image.data), char => char.charCodeAt(0))
        drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
        const controller = new AbortController()
        drawAbortRef.current = controller
        return placeSourceImage(editor, new Blob([bytes], { type: image.mimeType }), source.id, `${source.title} · slide ${sourceSegmentIndex + 1}`, checkpointIndexRef.current, controller.signal, `slide-${sourceSegmentIndex + 1}`)
      }
    }
    if (!source.pdfData) return {
      message: 'This source has no saved visual preview. I can continue from its extracted text.',
      pageText: readPaperPage(currentPaper.text, pageNumber, currentPaper.pageCount),
    }
    drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
    const controller = new AbortController()
    drawAbortRef.current = controller
    const { placePdfPage } = await import('./pdfPages')
    const pdfPage = segment?.locator.kind === 'pdf-page' ? segment.locator.page : sourceSegmentIndex + 1
    return placePdfPage(editor, source.pdfData, source.id, pdfPage, checkpointIndexRef.current, controller.signal)
  }, [currentPaper, papers])

  const readSourcePage = useCallback((pageNumber: number) => currentPaper
    ? readPaperPage(currentPaper.text, pageNumber, currentPaper.pageCount)
    : 'No source is open.', [currentPaper])

  const moveCheckpoint = useCallback(async (direction: 'next' | 'previous') => {
    const activePlan = planRef.current
    if (!activePlan) return 'No lesson is ready.'
    // At the last checkpoint we have while the rest of the course is still being planned: wait, don't end the lesson.
    const job = courseJobRef.current
    if (direction === 'next' && checkpointIndexRef.current >= activePlan.sessions.length - 1 && job?.status === 'running' && job.paperId === currentPaper?.id) {
      awaitingNextRef.current = true
      setStatus('Nice work. Your next checkpoint is being prepared...')
      setTutorDetail('The rest of the course is being planned from your sources; the next checkpoint opens as soon as it is ready.')
      return 'The next checkpoint is still being prepared from the sources. Recap this checkpoint or answer the learner\'s questions; the next checkpoint opens automatically when it is ready.'
    }
    const delta = direction === 'next' ? 1 : -1
    const next = Math.max(0, Math.min(activePlan.sessions.length - 1, checkpointIndexRef.current + delta))
    drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
    checkpointIndexRef.current = next
    setCheckpointIndex(next)
    await persistLessonState(activePlan, next)
    checkpointTranscriptStartRef.current = transcriptRef.current.length
    return formatCheckpointBrief(buildCheckpointBrief(activePlan, next, knowledgeGraphRef.current, learnerEvidenceRef.current, currentPaper?.pageCount))
  }, [currentPaper, persistLessonState])

  const selectCheckpoint = useCallback((index: number) => {
    const activePlan = planRef.current
    if (!activePlan) return
    const next = Math.max(0, Math.min(activePlan.sessions.length - 1, index))
    drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
    checkpointIndexRef.current = next
    checkpointTranscriptStartRef.current = transcriptRef.current.length
    setCheckpointIndex(next)
    void persistLessonState(activePlan, next)
    tutorRef.current?.updateCheckpointBrief(buildCheckpointBrief(activePlan, next, knowledgeGraph, learnerEvidence, currentPaper?.pageCount))
  }, [currentPaper, knowledgeGraph, learnerEvidence, persistLessonState])

  // ---------- AIMD language level and the diagnostic agent ----------
  const levelKey = useCallback((paperId: string) => `litterally:language-level:${user.id}:${paperId}`, [user.id])

  // Each source remembers the learner's level, so returning to it picks up where the language left off.
  useEffect(() => {
    if (!currentId) return
    let stored = Number.NaN
    try { stored = Number(localStorage.getItem(levelKey(currentId))) } catch { /* storage unavailable */ }
    const level = Number.isInteger(stored) && stored >= AIMD.min && stored <= AIMD.max ? stored : AIMD.start
    languageLevelRef.current = level
    setLanguageLevel(level)
    tutorRef.current?.setLanguageGuide(languageGuide(level))
  }, [currentId, levelKey])

  /** Additive increase when the learner keeps up, multiplicative decrease when they struggle. */
  const applyLanguageSignal = useCallback((signal: AimdSignal) => {
    const previous = languageLevelRef.current
    const next = nextLevel(previous, signal)
    if (next === previous) return
    languageLevelRef.current = next
    setLanguageLevel(next)
    if (currentId) { try { localStorage.setItem(levelKey(currentId), String(next)) } catch { /* storage unavailable */ } }
    tutorRef.current?.setLanguageGuide(languageGuide(next))
  }, [currentId, levelKey])
  const applyLanguageSignalRef = useRef(applyLanguageSignal)
  applyLanguageSignalRef.current = applyLanguageSignal

  /** Sends the diagnostic's findings to the background planner, or holds them until its job id arrives. */
  const shareDiagnostic = useCallback((paperId: string, summary: string) => {
    const job = courseJobRef.current
    if (job?.paperId === paperId && job.status === 'running') {
      diagnosticResultRef.current = null
      void shareDiagnosticWithPlanner(job.jobId, { languageLevel: languageLevelRef.current, diagnosticSummary: summary }).catch(() => { /* the plan still adapts live */ })
    } else diagnosticResultRef.current = { paperId, summary }
  }, [])

  const openDiagnostic = useCallback((paper: ImportedPaper) => {
    diagnosticResultRef.current = null
    updateDiagnosticChat({ paperId: paper.id, turns: [], busy: true, done: false, summary: '', error: '' })
    requestDiagnosticTurn({
      paperTitle: paper.title, sourceKind: paper.sourceKind, pageCount: paper.pageCount, text: paper.text,
      projectId: activeProjectIdRef.current, turns: [], languageGuide: languageGuide(languageLevelRef.current),
    }).then(reply => {
      const chat = diagnosticChatRef.current
      // Open with a spoken big-picture overview from the cached source summary, then the first question (one tutor turn).
      const summary = projectsRef.current.find(p => p.id === activeProjectIdRef.current)?.summaries[paper.id]
      const overview = summary ? `Here's the big picture. ${summary.summary.slice(0, 500)} ${summary.keyIdeas.length ? `We'll look at ${summary.keyIdeas.slice(0, 3).join('; ')}.` : ''} ` : ''
      if (chat?.paperId === paper.id) updateDiagnosticChat({ ...chat, busy: false, turns: [{ role: 'tutor', text: `${overview}${reply.question}` }] })
    }, reason => {
      const chat = diagnosticChatRef.current
      if (chat?.paperId === paper.id) updateDiagnosticChat({ ...chat, busy: false, error: errorMessage(reason) })
    })
  }, [updateDiagnosticChat])

  const answerDiagnostic = useCallback(async (text: string) => {
    const chat = diagnosticChatRef.current
    const paper = currentPaper
    if (!chat || chat.busy || chat.done || !paper || paper.id !== chat.paperId) return
    const turns: DiagnosticTurn[] = [...chat.turns, { role: 'learner', text }]
    updateDiagnosticChat({ ...chat, turns, busy: true, error: '' })
    try {
      const reply = await requestDiagnosticTurn({
        paperTitle: paper.title, sourceKind: paper.sourceKind, pageCount: paper.pageCount, text: paper.text,
        projectId: activeProjectIdRef.current, turns, languageGuide: languageGuide(languageLevelRef.current),
      })
      applyLanguageSignal(reply.lastAnswerSignal)
      const current = diagnosticChatRef.current
      if (!current || current.paperId !== paper.id) return
      if (reply.done) {
        updateDiagnosticChat({ ...current, turns, busy: false, done: true, summary: reply.summary })
        shareDiagnostic(paper.id, reply.summary)
      } else updateDiagnosticChat({ ...current, busy: false, turns: [...turns, { role: 'tutor', text: reply.question }] })
    } catch (reason) {
      const current = diagnosticChatRef.current
      if (current?.paperId === paper.id) updateDiagnosticChat({ ...current, turns: chat.turns, busy: false, error: `${errorMessage(reason)} Your answer was not sent; please try again.` })
    }
  }, [currentPaper, applyLanguageSignal, shareDiagnostic, updateDiagnosticChat])

  const startTutor = useCallback(async () => {
    const activePlan = planRef.current
    if (!currentPaper || !activePlan) return
    setTutorMicMuted(true)
    if (document.hidden) {
      setTutorStatus('paused')
      setTutorDetail('Return to this page before starting the voice tutor.')
      return
    }
    setTutorStatus('connecting')
    transcriptRef.current = []
    checkpointTranscriptStartRef.current = 0
    setTranscript([])
    setTutorDetail('Connecting to the voice tutor...')
    const voiceAudioContext = new AudioContext()
    void voiceAudioContext.resume()
    try {
      const [configResponse, { HybridTutor }] = await Promise.all([
        readApiJson<{ streaming?: boolean; bargeIn?: boolean; rtcUrl?: string; iceServers?: RTCIceServer[] }>(fetch('/api/voice/config'), 'The local voice settings service'),
        import('./hybridTutor'),
      ])
      const voiceConfig = configResponse
      const callbacks: TutorCallbacks = {
        presentTeachingBeat,
        drawDiagram,
        showSourcePage,
        readSourcePage,
        moveCheckpoint,
        getSelection: () => editorRef.current ? getSelectionContext(editorRef.current) : null,
        getWhiteboardContext: () => editorRef.current && currentPaper ? getWhiteboardContext(editorRef.current, currentPaper.id, checkpointIndexRef.current) : 'No canvas is ready.',
        getTeachingState: beatId => editorRef.current && currentPaper ? getTeachingExecutionState(editorRef.current, currentPaper.id, beatId) : { beatId, actions: [] },
        onStatus: (nextStatus, detail) => {
          setTutorStatus(nextStatus)
          if (detail !== undefined) setTutorDetail(detail)
        },
        onTranscript: lines => {
          transcriptRef.current = lines
          setTranscript(lines)
          // Each new learner utterance is read for confusion or wanting more (cheap rules, no extra model call).
          const latest = [...lines].reverse().find(line => line.role === 'You')?.text || ''
          if (latest && latest !== lastLearnerLineRef.current) { lastLearnerLineRef.current = latest; applyLanguageSignalRef.current(readLearnerSignal(latest)) }
        },
        onInterrupt: () => { drawAbortRef.current?.abort(); diagramAbortRef.current?.abort() },
      }
      const tutor = new HybridTutor(callbacks, voiceAudioContext, { streaming: voiceConfig.streaming !== false, bargeIn: voiceConfig.bargeIn !== false, rtcUrl: voiceConfig.rtcUrl, iceServers: voiceConfig.iceServers })
      tutorRef.current = tutor
      tutor.setLanguageGuide(languageGuide(languageLevelRef.current))
      const index = checkpointIndexRef.current
      await tutor.connect(currentPaper.title, buildCheckpointBrief(activePlan, index, knowledgeGraph, learnerEvidence, currentPaper.pageCount))
    } catch (reason) {
      void voiceAudioContext.close()
      const message = errorMessage(reason)
      tutorRef.current?.close()
      tutorRef.current = null
      setTutorStatus('error')
      setTutorDetail(/permission|microphone|notallowed/i.test(message) ? 'Microphone access was not granted. Allow it in the browser, then try again.' : message)
    }
  }, [currentPaper, drawDiagram, knowledgeGraph, learnerEvidence, moveCheckpoint, presentTeachingBeat, readSourcePage, showSourcePage])

  const pauseTutor = useCallback(() => {
    drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
    tutorRef.current?.pause()
    setTutorMicMuted(true)
    setTutorDetail('Lesson paused. Your canvas and checkpoint are saved.')
  }, [])

  const startTutorPushToTalk = useCallback(() => {
    const tutor = tutorRef.current
    if (!tutor) return
    setTutorMicMuted(false)
    setTutorDetail('Listening while held. Release to send.')
    void tutor.setMicMuted(false).then(started => {
      if (!started && tutorRef.current === tutor) setTutorMicMuted(true)
    })
  }, [])

  const endTutorPushToTalk = useCallback(() => {
    setTutorMicMuted(true)
    void tutorRef.current?.setMicMuted(true)
  }, [])

  const resumeTutor = useCallback(() => {
    const activePlan = planRef.current
    if (!activePlan) return
    const index = checkpointIndexRef.current
    const checkpoint = activePlan.sessions[index]
    if (!tutorRef.current) { void startTutor(); return }
    tutorRef.current.resume(buildCheckpointBrief(activePlan, index, knowledgeGraph, learnerEvidence, currentPaper?.pageCount))
    setTutorDetail(`Resuming ${checkpoint.title}.`)
  }, [currentPaper, knowledgeGraph, learnerEvidence, startTutor])

  const stopTutor = useCallback(() => {
    drawAbortRef.current?.abort(); diagramAbortRef.current?.abort()
    tutorRef.current?.close()
    tutorRef.current = null
    setTutorMicMuted(true)
    setTutorStatus('stopped')
    setTutorDetail('Conversation stopped. Your checkpoint and canvas remain saved.')
  }, [])

  const askTutor = useCallback(async (question: string, selectionImage?: string, selectionContext?: ReturnType<typeof getSelectionContext>) => {
    lastLearnerLineRef.current = question
    applyLanguageSignalRef.current(readLearnerSignal(question))
    const paper = currentPaper
    const activePlan = planRef.current
    const checkpoint = activePlan?.sessions[checkpointIndexRef.current]
    if (!paper || !checkpoint) throw new Error('Build a lesson plan before asking the tutor.')
    if (tutorRef.current && ['listening', 'speaking', 'drawing'].includes(tutorStatus)) {
      tutorRef.current.ask(question)
      return
    }
    const result = await readApiJson<{ answer: string }>(fetch('/api/teach/ask', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: paper.title, question, checkpoint,
        paperEvidence: readPaperEvidence(paper.text, checkpoint.sourcePages, paper.pageCount),
        selection: selectionContext || (selectionImage && editorRef.current ? getSelectionContext(editorRef.current) : undefined),
        selectionImage, history: transcriptRef.current.slice(-6),
      }),
    }), 'The learning service')
    if (currentId !== paper.id) return
    if (typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('The tutor returned no answer.')
    const lines = [...transcriptRef.current, { role: 'You' as const, text: question }, { role: 'Tutor' as const, text: result.answer.trim() }].slice(-8)
    transcriptRef.current = lines
    setTranscript(lines)
  }, [currentPaper, currentId, tutorStatus])

  const storeTeachingPlan = useCallback(async (paper: ImportedPaper, nextPlan: TeachingPlan) => {
    if (currentId !== paper.id) return
    const { paper: updatedPaper, graph } = await saveLearningPlan(
      paper, nextPlan, graph => recordPlanKnowledge(graph, nextPlan, paper.id, paper.title, paper.sourceSegments), true, 0, [paper.id, ...selectedSourceIds.filter(id => id !== paper.id)],
    )
    if (currentId !== paper.id) return
    setPapers(items => items.map(item => item.id === updatedPaper.id ? updatedPaper : item))
    knowledgeGraphRef.current = graph
    setKnowledgeGraph(graph)
    planRef.current = nextPlan
    checkpointIndexRef.current = 0
    setPlan(nextPlan)
    setCheckpointIndex(0)
    setTranscript([])
    setTutorStatus('idle')
    setTutorDetail('Plan ready. Start the voice lesson when you are ready to use the microphone.')
    setStatus(`Teaching plan ready for "${paper.title}"`)
  }, [currentId, selectedSourceIds])

  const generateTeachingPlan = useCallback(async (goal?: string) => {
    if (!currentPaper) return
    const paper = currentPaper
    setPlanBusy(true)
    setError('')
    setStatus('The teaching agent is planning your lesson...')
    // The diagnostic conversation runs while checkpoint 1 is planned, so it costs the learner no extra waiting.
    openDiagnostic(paper)
    try {
      const learningGoal = paper.sourceKind === 'topic'
        ? `Understand what ${paper.title} is and how it works: its core ideas and mechanics, without tangents.`
        : goal?.trim() || defaultLearningGoal
      const priorKnowledge = { propositions: knowledgeGraph.propositions?.slice(-100).map(({ id, concept, statement }) => ({ id, concept, statement })) || [], reasoningLinks: knowledgeGraph.reasoningLinks?.slice(-200).map(({ source, target, relationType, reason }) => ({ source, target, relationType, reason })) || [] }
      // Fast path: checkpoint 1 now; the agent team plans the rest in the background. Falls back to one full plan.
      let nextPlan: TeachingPlan
      let jobId = ''
      try {
        const fast = await requestFastPlan({
          paperTitle: paper.title, sourceKind: paper.sourceKind, pageCount: paper.pageCount, text: paper.text, learningGoal,
          projectId: activeProjectIdRef.current, knowledge: learnerKnowledge.slice(0, 100), evidence: learnerEvidence.slice(-20), priorKnowledge,
          languageLevel: languageLevelRef.current,
        })
        nextPlan = fast.plan
        jobId = fast.jobId
      } catch {
        nextPlan = await requestAdaptivePlan({
          paperTitle: paper.title, sourceKind: paper.sourceKind, pageCount: paper.pageCount, text: paper.text,
          diagnostic: { goal: learningGoal, questions: [] }, answers: [],
          knowledge: learnerKnowledge.slice(0, 100), evidence: learnerEvidence.slice(-20), priorKnowledge,
        })
      }
      if (currentId !== paper.id) return
      awaitingNextRef.current = false
      await storeTeachingPlan(paper, nextPlan)
      trackCourseJob(jobId ? { jobId, paperId: paper.id, status: 'running' } : null)
      // A diagnostic that finished before the job existed hands its findings over now.
      const finished = diagnosticResultRef.current
      if (jobId && finished?.paperId === paper.id) shareDiagnostic(paper.id, finished.summary)
      if (jobId) {
        setStatus(`Checkpoint 1 is ready. The rest of "${paper.title}" is being planned in the background.`)
        setTutorDetail('Checkpoint 1 is ready. The rest of the course is being planned in the background; start whenever you like.')
      }
    } catch (reason) {
      if (currentId !== paper.id) return
      const message = errorMessage(reason)
      setError(message)
      setStatus(message)
      setTutorStatus('error')
      setTutorDetail(message)
    } finally {
      setPlanBusy(false)
    }
  }, [currentPaper, currentId, knowledgeGraph, learnerKnowledge, learnerEvidence, storeTeachingPlan, trackCourseJob, openDiagnostic, shareDiagnostic])

  // Compare and deep-dive lessons start planning on their own once the combined sources are in place.
  useEffect(() => {
    if (!pendingGoal || view !== 'lesson' || planBusy || !currentPaper) return
    if (selectedSourceIds.join('|') !== pendingGoal.extra.join('|')) return
    const goal = pendingGoal.goal
    setPendingGoal(null)
    void generateTeachingPlan(goal)
  }, [pendingGoal, selectedSourceIds, view, planBusy, currentPaper, generateTeachingPlan])

  useEffect(() => {
    loadProjects().then(list => { projectsRef.current = list; setProjects(list); setProjectsLoaded(true) }).catch(reason => { setError(errorMessage(reason)); setProjectsLoaded(true) })
  }, [])
  // First run with an existing library: gather it into a starter project so nothing looks lost.
  useEffect(() => {
    if (!projectsLoaded || !libraryReady || projectsRef.current.length || !papers.length) return
    updateProjects(() => [newProject('My library', 'Everything you imported before projects existed.', papers.map(p => p.id))])
  }, [projectsLoaded, libraryReady, papers, updateProjects])

  const summaryRequested = useRef(new Set<string>())
  useEffect(() => {
    if (!activeProject) return
    const projectId = activeProject.id
    for (const paper of projectSources) {
      if (paper.documentRole === 'process') continue
      const requestKey = `${projectId}:${paper.id}`
      if (isCurrentSummary(activeProject.summaries[paper.id]) || summaryRequested.current.has(requestKey)) continue
      summaryRequested.current.add(requestKey)
      setPendingSummaries(prev => new Set(prev).add(paper.id))
      summarizeSource(paper)
        .then(summary => updateProjects(list => list.map(p => p.id === projectId ? { ...p, summaries: { ...p.summaries, [paper.id]: summary } } : p)))
        .catch(reason => { summaryRequested.current.delete(requestKey); setAnalysisError({ projectId, message: errorMessage(reason) }) })
        .finally(() => setPendingSummaries(prev => { const next = new Set(prev); next.delete(paper.id); return next }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject, papers, analysisRetry])

  const synthesisRequested = useRef(new Set<string>())
  useEffect(() => {
    if (!activeProject || contentSources.length < 2 || !contentSources.every(paper => isCurrentSummary(activeProject.summaries[paper.id]))) return
    const key = projectSynthesisKey(contentProject!)
    const requestKey = `${activeProject.id}:${key}`
    if (activeProject.synthesisFor === key || synthesisRequested.current.has(requestKey)) return
    synthesisRequested.current.add(requestKey)
    synthesizeProject(contentProject!, contentSources)
      .then(synthesis => updateProjects(list => list.map(project => project.id === activeProject.id && projectSynthesisKey(project) === key ? { ...project, synthesis, synthesisFor: key } : project)))
      .catch(reason => { synthesisRequested.current.delete(requestKey); setAnalysisError({ projectId: activeProject.id, message: errorMessage(reason) }) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject, papers, analysisRetry])


  /** Swaps in a plan that extends the current one, keeping the learner's place (or moving them on if they were waiting). */
  const applyExtendedPlan = useCallback(async (paper: ImportedPaper, nextPlan: TeachingPlan, advance: boolean) => {
    const index = checkpointIndexRef.current
    const nextIndex = Math.min(advance ? index + 1 : index, nextPlan.sessions.length - 1)
    const { paper: updated, graph } = await saveLearningPlan(
      paper, nextPlan, graph => recordPlanKnowledge(graph, nextPlan, paper.id, paper.title, paper.sourceSegments), false, nextIndex, [paper.id, ...selectedSourceIds.filter(id => id !== paper.id)],
    )
    if (currentId !== paper.id) return
    knowledgeGraphRef.current = graph
    setKnowledgeGraph(graph)
    setPapers(items => items.map(item => item.id === updated.id ? updated : item))
    planRef.current = nextPlan
    setPlan(nextPlan)
    if (nextIndex !== index) checkpointTranscriptStartRef.current = transcriptRef.current.length
    checkpointIndexRef.current = nextIndex
    setCheckpointIndex(nextIndex)
    tutorRef.current?.updateCheckpointBrief(buildCheckpointBrief(nextPlan, nextIndex, graph, learnerEvidenceRef.current, paper.pageCount))
  }, [currentId, selectedSourceIds])

  /** Merges the background agents' checkpoints 2..N. Returns false when the plan changed mid-merge, so the caller retries. */
  const applyBackgroundPlan = useCallback(async (job: { jobId: string; paperId: string }) => {
    const paper = currentPaper
    const currentPlan = planRef.current
    if (!paper || paper.id !== job.paperId || !currentPlan) return true
    const advance = awaitingNextRef.current
    const merged = await mergeCourseJob(job.jobId, { currentPlan, completedCount: checkpointIndexRef.current + (advance ? 1 : 0), pageCount: paper.pageCount })
    if (planRef.current !== currentPlan || currentId !== paper.id) return false
    await applyExtendedPlan(paper, merged, advance)
    awaitingNextRef.current = false
    setStatus(advance ? 'Your next checkpoint is ready.' : `The rest of your course is ready: ${merged.sessions.length} checkpoints.`)
    setTutorDetail(advance ? 'The next checkpoint is open.' : `The rest of your course is ready: ${merged.sessions.length} checkpoints in all.`)
    return true
  }, [currentPaper, currentId, applyExtendedPlan])

  /** The background job failed or was lost (for example after a server restart): plan the rest with one revision call. */
  const planRestInForeground = useCallback(async (paperId: string) => {
    const paper = currentPaper
    const currentPlan = planRef.current
    if (!paper || paper.id !== paperId || !currentPlan) return
    const advance = awaitingNextRef.current
    const knowledge = knowledgeGraphRef.current
    try {
      const nextPlan = await requestAdaptiveRevision({
        paperTitle: paper.title, sourceKind: paper.sourceKind, pageCount: paper.pageCount, text: paper.text,
        currentPlan, completedCount: Math.min(currentPlan.sessions.length, Math.max(1, checkpointIndexRef.current + (advance ? 1 : 0))),
        knowledge: latestConceptEvidence(learnerEvidenceRef.current).slice(0, 100), evidence: learnerEvidenceRef.current.slice(-20),
        priorKnowledge: {
          propositions: (knowledge.propositions || []).slice(-100).map(({ id, concept, statement }) => ({ id, concept, statement })),
          chains: (knowledge.chains || []).slice(-100).map(({ id, premises, conclusion, reason }) => ({ id, premises, conclusion, reason })),
        },
      })
      if (planRef.current !== currentPlan) return
      await applyExtendedPlan(paper, nextPlan, advance)
      awaitingNextRef.current = false
      setStatus('The rest of your course is ready.')
    } catch (reason) {
      setStatus(`The rest of the course could not be planned: ${errorMessage(reason)}`)
    }
  }, [currentPaper, applyExtendedPlan])

  // Poll the background planning job; merge its checkpoints in when done, or fall back if it failed or was lost.
  useEffect(() => {
    if (!courseJob || courseJob.status !== 'running') return
    if (courseJob.paperId !== currentId) { trackCourseJob(null); return }
    let stopped = false
    let timer = 0
    const finish = (status: 'done' | 'failed') => { if (!stopped) trackCourseJob({ ...courseJob, status }) }
    const tick = async () => {
      if (stopped) return
      try {
        const job = await readCourseJob(courseJob.jobId)
        if (stopped) return
        if (job.status === 'done') {
          if (await applyBackgroundPlan(courseJob)) { finish('done'); return }
        } else if (job.status === 'failed') {
          finish('failed'); await planRestInForeground(courseJob.paperId); return
        }
      } catch (reason) {
        if (/not found/i.test(errorMessage(reason))) { finish('failed'); await planRestInForeground(courseJob.paperId); return }
      }
      if (!stopped) timer = window.setTimeout(tick, 4000)
    }
    timer = window.setTimeout(tick, 4000)
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [courseJob, currentId, applyBackgroundPlan, planRestInForeground, trackCourseJob])

  const refreshKnowledgeGraph = useCallback(() => {
    void loadKnowledgeGraph().then(graph => {
      knowledgeGraphRef.current = graph
      setKnowledgeGraph(graph)
    }).catch(() => setStatus('Could not refresh the knowledge graph.'))
  }, [])

  useEffect(() => {
    window.addEventListener('focus', refreshKnowledgeGraph)
    return () => {
      window.removeEventListener('focus', refreshKnowledgeGraph)
    }
  }, [refreshKnowledgeGraph])


  return (
    <main className="app-shell">
      <header className="topbar">
        <nav className="crumbs" aria-label="Location">
          <button className="brand" onClick={() => navigate('projects', null)} aria-current={view === 'projects' ? 'page' : undefined}><Wordmark size={26} /></button>
          {view !== 'projects' && activeProject && <><span className="crumb-sep" aria-hidden="true">/</span><button className="crumb-link" onClick={() => navigate('board')} aria-current={view === 'board' ? 'page' : undefined}>{activeProject.name}</button></>}
          {view === 'board' && <><span className="crumb-sep" aria-hidden="true">/</span><span className="crumb-current" aria-current="page">Board</span></>}
          {view === 'lesson' && currentPaper && <><span className="crumb-sep" aria-hidden="true">/</span><span className="crumb-current" aria-current="page">{currentPaper.title}</span></>}
        </nav>
        <div className="top-actions">
          {view === 'board' && <Button size="sm" variant="outline" onClick={() => navigate('overview')}>Sources</Button>}
          {view === 'overview' && <Button size="sm" variant="outline" onClick={() => navigate('board')}>Board</Button>}
          <Button size="sm" variant="outline" title={`Signed in as ${user.email}`} onClick={() => setAccountOpen(true)}>Account</Button>
        </div>
      </header>

      <div className="workspace">
        <section className="canvas-column">
          {view === 'projects' ? <ProjectsPage
            projects={projects}
            papers={papers}
            loading={!projectsLoaded || !libraryReady}
            onOpen={id => navigate('board', id)}
            onCreate={(name, description) => { const p = newProject(name, description); updateProjects(list => [p, ...list]); navigate('board', p.id) }}
            onDelete={project => { if (confirm(`Delete the project "${project.name}"? Its sources stay in your library.`)) updateProjects(list => list.filter(p => p.id !== project.id)) }}
          /> : view === 'overview' && activeProject ? <ProjectOverview
            project={activeProject}
            sources={projectSources}
            library={papers}
            pendingSummaries={pendingSummaries}
            onLearn={openLesson}
            onBoard={() => navigate('board')}
            onDeep={openDeep}
            onAdd={openAdd}
            onAttach={id => { setAnalysisError(null); updateProjects(list => list.map(p => p.id === activeProject.id ? { ...p, sourceIds: [...p.sourceIds, id] } : p)) }}
            onDetach={id => { setAnalysisError(null); updateProjects(list => list.map(p => p.id === activeProject.id ? { ...p, sourceIds: p.sourceIds.filter(s => s !== id) } : p)) }}
          /> : view === 'board' && activeProject ? (libraryReady && <Board
            key={activeProject.id} canvasKey={projectBoardKey(activeProject.id)} papers={projectSources} summaries={projectSummaries}
            synthesis={projectSynthesisCurrent ? activeProject.synthesis || null : null} hiddenConnectionPairs={activeProject.hiddenConnectionPairs || []}
            analysisStatus={projectAnalysisStatus} analysisError={analysisError?.projectId === activeProject.id ? analysisError.message : null}
            onRetry={() => { setAnalysisError(null); setAnalysisRetry(value => value + 1) }}
            onHideConnection={pair => updateProjects(list => list.map(project => project.id === activeProject.id ? { ...project, hiddenConnectionPairs: [...new Set([...(project.hiddenConnectionPairs || []), pair])] } : project))}
            onRestoreConnection={pair => updateProjects(list => list.map(project => project.id === activeProject.id ? { ...project, hiddenConnectionPairs: (project.hiddenConnectionPairs || []).filter(item => item !== pair) } : project))}
            onRestoreHiddenConnections={() => updateProjects(list => list.map(project => project.id === activeProject.id ? { ...project, hiddenConnectionPairs: [] } : project))}
            onOpen={openLesson} onCompare={openCompare} onAdd={openAdd}
          />)
          : view !== 'lesson' ? <ProjectsPage projects={projects} papers={papers} loading={!projectsLoaded || !libraryReady} onOpen={id => navigate('board', id)} onCreate={(name, description) => { const p = newProject(name, description); updateProjects(list => [p, ...list]); navigate('board', p.id) }} onDelete={project => { if (confirm(`Delete the project "${project.name}"? Its sources stay in your library.`)) updateProjects(list => list.filter(p => p.id !== project.id)) }} /> : <>
          <div className={`canvas-area ${dragging ? 'canvas-dragging' : ''}`} onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={onCanvasDrop}>
            {libraryReady && <PersistentTldraw key={currentPaper?.id || 'blank'} components={paperCanvasComponents} shapeUtils={lessonShapeUtils} canvasKey={currentPaper ? paperCanvasPersistenceKey(currentPaper.id) : 'margin-paper-v2-empty'} onMount={editor => {
              selectionCleanupRef.current?.()
              editorRef.current = editor
              if (currentPaper) initializePaperCanvas(editor, currentPaper)
            }} autoFocus />}
            <div ref={agentCursorRef} className="agent-cursor" aria-hidden="true" hidden>
              <svg viewBox="0 0 20 24" focusable="false"><path d="M2 1v19l5-5 4 8 3-1.5-4-8H17L2 1z" /></svg>
              <span>Tutor</span>
            </div>
            {dragging && <div className="canvas-drop-cover" aria-hidden="true"><span>Drop to import</span></div>}
            {planBusy && <PaperLoader compact={diagnosticChat?.paperId === currentId} label="Planning your lesson…" lines={[currentPaper?.title || 'Your lesson', ...((currentId && activeProject?.summaries[currentId]?.keyIdeas) || [])]} />}
            {currentPaper && diagnosticChat?.paperId === currentPaper.id && <DiagnosticChat
              title={currentPaper.title} turns={diagnosticChat.turns} busy={diagnosticChat.busy} done={diagnosticChat.done} summary={diagnosticChat.summary}
              error={diagnosticChat.error} level={languageLevel} planReady={!planBusy && Boolean(plan)}
              onAnswer={text => void answerDiagnostic(text)} onClose={() => updateDiagnosticChat(null)}
            />}
            {!planBusy && tutorStatus === 'connecting' && <PaperLoader compact label="Getting ready…" />}
            {currentPaper && <LessonDock
              plan={plan} planBusy={planBusy} checkpointIndex={checkpointIndex} status={tutorStatus} detail={tutorDetail || error}
              micMuted={tutorMicMuted} transcript={transcript}
              onBuild={() => void generateTeachingPlan()} onAsk={question => askTutor(question)} onStart={() => void startTutor()} onPause={pauseTutor} onResume={resumeTutor} onStop={stopTutor}
              onSelectCheckpoint={selectCheckpoint} onTalkStart={startTutorPushToTalk} onTalkEnd={endTutorPushToTalk}
            />}
          </div>
          </>}
        </section>

      </div>

      <dialog ref={modalRef} className="ingest-dialog" onClose={() => setAddOpen(false)} onClick={event => { if (event.target === modalRef.current) setAddOpen(false) }}>
        <div className="dialog-head"><h2>Add material</h2><button className="dialog-close" onClick={() => setAddOpen(false)} aria-label="Close import dialog">x</button></div>
        <IntakePanel busy={busy} progress={progress} error={error} onFiles={files => void importFiles(files)} onUrl={url => void importUrl(url)} onTopic={topic => void createTopicLesson(topic)} />
      </dialog>
      {accountOpen && <AccountSettings user={user} onUserUpdated={onUserUpdated} onSignOut={onSignOut} onClose={() => setAccountOpen(false)} />}
      <div className="status-live" role="status">{status}</div>
    </main>
  )
}
