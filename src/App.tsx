import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './components/ui/button'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Input } from './components/ui/input'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { DefaultStylePanel, Tldraw, toRichText, type Editor, type TLShapeId, type TLUiStylePanelProps } from 'tldraw'
import 'tldraw/tldraw.css'
import { deletePaper as deletePaperRecord, deletePaperCanvas, latestConceptEvidence, listPapers, loadKnowledgeGraph, loadLearningProfile, mergeTaughtKnowledge, paperCanvasPersistenceKey, recordPlanKnowledge, saveLearningOutcome, saveLearningPlan, savePaper, type ImportedPaper, type LearningEvidence } from './storage'
import { readPaperEvidence, readPaperPage } from './paper-text.mjs'
import { applyDiagramPlan, applyTeachingBeat, buildCheckpointBrief, formatCheckpointBrief, getSelectionContext, getTeachingExecutionState, requestDiagramPlan, type DiagramBrief, type TeachingBeat, type TeachingPlan } from './lessonAgent'
import { assessAnswer, extractTaughtKnowledge, requestAdaptivePlan, requestAdaptiveRevision, requestLearningDiagnostic, requestPracticeQuestion, defaultLearningGoal, type AnswerReview, type LearningDiagnostic } from './learning'
import { finishPdfExtraction, type PdfExtraction } from './pdfImport'
import { importImageSource, importMediaSource, importTextSource } from './sourceImport'
import { placeSourceImage } from './sourceImage'
import { TutorPanel } from './TutorPanel'
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
const PaperStyleControls = createContext({ open: false, setOpen: (_open: boolean) => {} })

function combineLearningSources(sources: ImportedPaper[]) {
  const segments = sources.flatMap(source => (source.sourceSegments || []).map(segment => ({ ...segment, sourceId: source.id, sourceTitle: source.title })))
  const text = sources.length === 1
    ? sources[0].text
    : segments.map((segment, index) => `[Page ${index + 1} of ${segments.length}]\n[Source: ${segment.sourceTitle} · ${segment.locator.kind}]\n${segment.text}`).join('\n\n')
  return { segments, text }
}

function PaperStylePanel({ isMobile, styles }: TLUiStylePanelProps) {
  const { open } = useContext(PaperStyleControls)
  return isMobile || open ? <DefaultStylePanel isMobile={isMobile} styles={styles} /> : null
}

const paperCanvasComponents = { StylePanel: PaperStylePanel }

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
          <TabsTrigger value="file" className="intake-tab h-8 flex-none px-2 py-1 text-xs">Choose file</TabsTrigger>
          <TabsTrigger value="link" className="intake-tab h-8 flex-none px-2 py-1 text-xs">Web link</TabsTrigger>
          <TabsTrigger value="topic" className="intake-tab h-8 flex-none px-2 py-1 text-xs">Start from a topic</TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === 'file' ? (
        <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); onFiles(Array.from(event.dataTransfer.files)) }}>
          <input ref={inputRef} className="file-input" type="file" accept=".pdf,.txt,.md,.markdown,.csv,.pptx,.xlsx,.ts,.tsx,.js,.jsx,.mjs,.py,.java,.go,.rs,.c,.h,.cpp,.cs,.rb,.php,.sh,.sql,.json,.yaml,.yml,.toml,.xml,image/*,audio/*,video/*" multiple aria-label="Choose learning material files" onChange={event => { if (event.currentTarget.files) onFiles(Array.from(event.currentTarget.files)); event.currentTarget.value = '' }} />
          <div className="upload-symbol">+</div>
          <b>{dragging ? 'Drop files to import' : 'Drop learning material here'}</b>
          <span>or <button type="button" className="browse-link" onClick={() => inputRef.current?.click()}>choose files</button></span>
          <small>Multiple formats · up to 25 MB each</small>
        </div>
      ) : mode === 'link' ? (
        <form className="url-form" onSubmit={event => { event.preventDefault(); onUrl(url) }}>
          <label htmlFor="paper-url-modal">Paste a public web page, PDF, or arXiv URL</label>
          <div className="url-control"><Input id="paper-url-modal" type="url" autoComplete="url" inputMode="url" required placeholder="https://example.com/document.pdf" value={url} onChange={event => setUrl(event.target.value)} /><Button type="submit" size="icon-sm" disabled={busy || !url.trim()} aria-label="Add source">+</Button></div>
          <small>arXiv, public HTTPS web pages, and direct PDF links</small>
        </form>
      ) : (
        <form className="url-form" onSubmit={event => { event.preventDefault(); onTopic(topic) }}>
          <label htmlFor="learning-topic">What do you want to understand?</label>
          <div className="url-control"><Input id="learning-topic" required maxLength={300} placeholder="e.g. how mRNA vaccines work" value={topic} onChange={event => setTopic(event.target.value)} /><Button type="submit" size="sm" disabled={busy || !topic.trim()}>Start lesson</Button></div>
          <small>The tutor will research reputable background sources and build a lesson on a blank canvas.</small>
        </form>
      )}
      {busy && <div className="import-progress" role="status"><span className="spinner" /> {progress || 'Preparing material...'}</div>}
      {error && <div className="import-error" role="alert"><b>Could not import that source</b><span>{error}</span><small>Try another supported file or check that the link is public.</small></div>}
      <p className="privacy-note">Images are read locally in English. OCR data may download during setup; source text stays on this device until you build a plan.</p>
    </div>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

async function readApiResult(response: Response, localPdf?: Blob): Promise<PdfExtraction> {
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `The import service returned HTTP ${response.status}.`)
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
  const topic = paper.sourceKind === 'topic'
  editor.createShapes([
    { type: 'text', x: 0, y: 0, props: { richText: toRichText(paper.title), color: 'black', size: 'l', font: 'serif' } },
    { type: 'text', x: 0, y: 74, props: { richText: toRichText(topic ? 'Learning topic' : `${paper.pageCount} segments - ${paper.characterCount.toLocaleString()} characters extracted`), color: 'grey', size: 's', font: 'mono' } },
    { type: 'text', x: 0, y: 116, props: { richText: toRichText(topic ? 'Build the lesson visually here. Add notes, draw, and connect ideas as you learn.' : "This is your source's canvas. Select, draw, connect, or add notes as you read."), color: 'grey', size: 'm', font: 'sans' } },
  ] as any)
  editor.zoomToFit({ animation: { duration: 0 } })
}

export default function App() {
  const editorRef = useRef<Editor | null>(null)
  const modalRef = useRef<HTMLDialogElement>(null)
  const planRef = useRef<TeachingPlan | null>(null)
  const checkpointIndexRef = useRef(0)
  const tutorRef = useRef<HybridTutor | null>(null)
  const drawAbortRef = useRef<AbortController | null>(null)
  const learningBusyRef = useRef(false)
  const selectionCleanupRef = useRef<(() => void) | null>(null)
  const [papers, setPapers] = useState<ImportedPaper[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([])
  const [libraryReady, setLibraryReady] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [stylePanelOpen, setStylePanelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [planBusy, setPlanBusy] = useState(false)
  const [plan, setPlan] = useState<TeachingPlan | null>(null)
  const [diagnostic, setDiagnostic] = useState<LearningDiagnostic | null>(null)
  const [checkpointIndex, setCheckpointIndex] = useState(0)
  const [tutorStatus, setTutorStatus] = useState<TutorStatus>('idle')
  const [tutorMicMuted, setTutorMicMuted] = useState(false)
  const [tutorDetail, setTutorDetail] = useState('')
  const [transcript, setTranscript] = useState<Array<{ role: 'Tutor' | 'You'; text: string }>>([])
  const transcriptRef = useRef(transcript)
  const checkpointTranscriptStartRef = useRef(0)
  transcriptRef.current = transcript
  const [hasSelection, setHasSelection] = useState(false)
  const [knowledgeGraph, setKnowledgeGraph] = useState<Awaited<ReturnType<typeof loadKnowledgeGraph>>>({ nodes: [], edges: [] })
  const knowledgeGraphRef = useRef(knowledgeGraph)
  knowledgeGraphRef.current = knowledgeGraph
  const [learnerEvidence, setLearnerEvidence] = useState<LearningEvidence[]>([])
  const learnerEvidenceRef = useRef(learnerEvidence)
  learnerEvidenceRef.current = learnerEvidence
  const learnerKnowledge = useMemo(() => latestConceptEvidence(learnerEvidence), [learnerEvidence])
  const [learningBusy, setLearningBusy] = useState(false)
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null)
  const [status, setStatus] = useState('Your library is stored on this device')

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

  const toggleLearningSource = useCallback((sourceId: string) => {
    if (!currentId || sourceId === currentId) return
    const next = selectedSourceIds.includes(sourceId)
      ? selectedSourceIds.filter(id => id !== sourceId)
      : [...selectedSourceIds, sourceId]
    const sourceIds = next.filter(id => id !== currentId)
    const selected = [papers.find(paper => paper.id === currentId), ...sourceIds.map(id => papers.find(paper => paper.id === id))].filter((paper): paper is ImportedPaper => Boolean(paper))
    const { segments, text } = combineLearningSources(selected)
    const segmentCount = segments.length
    if (segmentCount > 300 || text.length > 1_500_000) {
      setStatus('A lesson can combine up to 300 segments and 1.5 million extracted characters.')
      return
    }
    setSelectedSourceIds(sourceIds)
    planRef.current = null
    setPlan(null)
    setDiagnostic(null)
    checkpointIndexRef.current = 0
    setCheckpointIndex(0)
    tutorRef.current?.close()
    tutorRef.current = null
    setTranscript([])
    setTutorStatus('idle')
    setTutorDetail('Build a new plan to use the selected sources together.')
    setStatus(`${selected.length} sources selected for the next lesson.`)
  }, [currentId, papers, selectedSourceIds])

  useEffect(() => {
    listPapers().then(items => {
      setPapers(items)
      const rememberedId = localStorage.getItem(CURRENT_PAPER_KEY)
      setCurrentId(items.some(item => item.id === rememberedId) ? rememberedId : items[0]?.id || null)
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
    setDiagnostic(null)
    if (currentId) localStorage.setItem(CURRENT_PAPER_KEY, currentId)
    else localStorage.removeItem(CURRENT_PAPER_KEY)
    drawAbortRef.current?.abort()
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
    setTutorMicMuted(false)
    setTutorDetail(missingLessonSource ? 'A source used by this saved lesson was removed. Rebuild the plan to continue.' : saved && !restored ? 'This lesson predates page-grounded teaching. Rebuild it to continue.' : '')
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
        drawAbortRef.current?.abort()
        tutorRef.current.pause()
        setTutorDetail('Paused while this tab is hidden. Return here and press Resume to continue.')
      }
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden)
  }, [])

  useEffect(() => () => {
    drawAbortRef.current?.abort()
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
    const paper: ImportedPaper = { ...result, id: crypto.randomUUID(), importedAt: new Date().toISOString() }
    await savePaper(paper)
    setPapers(existing => [paper, ...existing])
    setCurrentId(paper.id)
    setStatus(paper.sourceKind === 'topic' ? `Started a lesson on "${paper.title}"` : `Imported "${paper.title}" - ${paper.pageCount} segments`)
    setError('')
  }, [])

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

  const removePaper = useCallback(async (paper: ImportedPaper) => {
    if (!window.confirm(`Remove "${paper.title}" and its saved canvas from this device?`)) return
    if (paper.id === currentId) {
      drawAbortRef.current?.abort()
      tutorRef.current?.close()
      tutorRef.current = null
    } else if (selectedSourceIds.includes(paper.id)) {
      setSelectedSourceIds(ids => ids.filter(id => id !== paper.id))
      planRef.current = null
      setPlan(null)
      setDiagnostic(null)
      setCheckpointIndex(0)
      checkpointIndexRef.current = 0
      tutorRef.current?.close()
      tutorRef.current = null
      setTutorStatus('idle')
      setTutorDetail('A lesson source was removed. Rebuild the plan to continue.')
    }
    setDeletingPaperId(paper.id)
    setError('')
    try {
      await deletePaperCanvas(paper.id, () => setStatus('Close other Margin tabs to finish removing this source.'))
      await deletePaperRecord(paper.id)
      setPapers(existing => existing.filter(item => item.id !== paper.id))
      setCurrentId(current => current === paper.id ? papers.find(item => item.id !== paper.id)?.id || null : current)
      setStatus(`Removed "${paper.title}" from this device.`)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setDeletingPaperId(null)
    }
  }, [currentId, papers, selectedSourceIds])

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
            const response = await fetch('/api/ingest/office', { method: 'POST', body: form })
            const extracted = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(extracted.error || `The import service returned HTTP ${response.status}.`)
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
          const extraction = await readApiResult(await fetch('/api/ingest', { method: 'POST', body: form }), file)
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
      const extraction = await readApiResult(await fetch('/api/ingest/web', {
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

    drawAbortRef.current?.abort()
    const controller = new AbortController()
    drawAbortRef.current = controller
    setTutorStatus('drawing')
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
      })
      setTutorDetail(`"${diagram.title}" is ready.`)
      return `Completed "${diagram.title}".`
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return 'Drawing paused. Existing partial work remains on the canvas.'
      const message = errorMessage(reason)
      setTutorStatus('error')
      setTutorDetail(message)
      throw reason
    }
  }, [currentPaper])

  const presentTeachingBeat = useCallback(async (beat: TeachingBeat) => {
    const editor = editorRef.current
    if (!currentPaper || !editor) throw new Error('No source canvas is ready.')
    drawAbortRef.current?.abort()
    const controller = new AbortController()
    drawAbortRef.current = controller
    setTutorStatus('drawing')
    setTutorDetail(beat.context)
    return applyTeachingBeat(editor, beat, {
      lessonId: currentPaper.id,
      checkpointIndex: checkpointIndexRef.current,
      signal: controller.signal,
      onAction: setTutorDetail,
    })
  }, [currentPaper])

  const showSourcePage = useCallback(async (pageNumber: number) => {
    const editor = editorRef.current
    if (!currentPaper || !editor) return { message: 'No source canvas is ready.' }
    const segment = currentPaper.sourceSegments?.[pageNumber - 1]
    const source = papers.find(paper => paper.id === segment?.sourceId) || currentPaper
    const sourceSegmentIndex = segment ? (source.sourceSegments || []).findIndex(item => item.id === segment.id) : pageNumber - 1
    if (source.sourceKind === 'image' && source.sourceData) {
      drawAbortRef.current?.abort()
      const controller = new AbortController()
      drawAbortRef.current = controller
      return placeSourceImage(editor, source.sourceData, source.id, source.title, checkpointIndexRef.current, controller.signal)
    }
    const sourceFrames = source.sourceFrames
    if (source.sourceKind === 'video' && sourceFrames?.length) {
      const sourceLocator = segment?.locator
      const frameSeconds = sourceLocator?.kind === 'time-range' ? sourceLocator.frameSeconds : undefined
      const frame = sourceFrames.reduce((closest, candidate) => Math.abs(candidate.timeSeconds - (frameSeconds || 0)) < Math.abs(closest.timeSeconds - (frameSeconds || 0)) ? candidate : closest)
      drawAbortRef.current?.abort()
      const controller = new AbortController()
      drawAbortRef.current = controller
      return placeSourceImage(editor, frame.data, source.id, `${source.title} · ${Math.round(frame.timeSeconds)} seconds`, checkpointIndexRef.current, controller.signal, `frame-${pageNumber}`)
    }
    if (!source.pdfData) return {
      message: 'This source has no saved visual preview. I can continue from its extracted text.',
      pageText: readPaperPage(currentPaper.text, pageNumber, currentPaper.pageCount),
    }
    drawAbortRef.current?.abort()
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
    const delta = direction === 'next' ? 1 : -1
    const next = Math.max(0, Math.min(activePlan.sessions.length - 1, checkpointIndexRef.current + delta))
    drawAbortRef.current?.abort()
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
    drawAbortRef.current?.abort()
    checkpointIndexRef.current = next
    checkpointTranscriptStartRef.current = transcriptRef.current.length
    setCheckpointIndex(next)
    void persistLessonState(activePlan, next)
    tutorRef.current?.updateCheckpointBrief(buildCheckpointBrief(activePlan, next, knowledgeGraph, learnerEvidence, currentPaper?.pageCount))
  }, [currentPaper, knowledgeGraph, learnerEvidence, persistLessonState])

  const startTutor = useCallback(async () => {
    const activePlan = planRef.current
    if (!currentPaper || !activePlan) return
    setTutorMicMuted(false)
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
        fetch('/api/voice/config'),
        import('./hybridTutor'),
      ])
      const voiceConfig = await configResponse.json() as { streaming?: boolean; bargeIn?: boolean; rtcUrl?: string; iceServers?: RTCIceServer[] }
      if (!configResponse.ok) throw new Error('Could not load local voice settings.')
      const callbacks: TutorCallbacks = {
        presentTeachingBeat,
        drawDiagram,
        showSourcePage,
        readSourcePage,
        moveCheckpoint,
        getSelection: () => editorRef.current ? getSelectionContext(editorRef.current) : null,
        getTeachingState: beatId => editorRef.current && currentPaper ? getTeachingExecutionState(editorRef.current, currentPaper.id, beatId) : { beatId, actions: [] },
        onStatus: (nextStatus, detail) => {
          setTutorStatus(nextStatus)
          if (detail !== undefined) setTutorDetail(detail)
        },
        onTranscript: lines => { transcriptRef.current = lines; setTranscript(lines) },
        onInterrupt: () => drawAbortRef.current?.abort(),
      }
      const tutor = new HybridTutor(callbacks, voiceAudioContext, { streaming: voiceConfig.streaming !== false, bargeIn: voiceConfig.bargeIn !== false, rtcUrl: voiceConfig.rtcUrl, iceServers: voiceConfig.iceServers })
      tutorRef.current = tutor
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
    drawAbortRef.current?.abort()
    tutorRef.current?.pause()
    setTutorDetail('Lesson paused. Your canvas and checkpoint are saved.')
  }, [])

  const toggleTutorMic = useCallback(() => {
    const muted = !tutorMicMuted
    tutorRef.current?.setMicMuted(muted)
    setTutorMicMuted(muted)
    setTutorDetail(muted ? 'Microphone off. The tutor will continue speaking without listening.' : 'Microphone on. Speak to interrupt or ask a question.')
  }, [tutorMicMuted])

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
    drawAbortRef.current?.abort()
    tutorRef.current?.close()
    tutorRef.current = null
    setTutorStatus('stopped')
    setTutorDetail('Conversation stopped. Your checkpoint and canvas remain saved.')
  }, [])

  const askAboutSelection = useCallback(async () => {
    const editor = editorRef.current
    const context = editor ? getSelectionContext(editor) : null
    if (!editor || !context) return
    try {
      const image = await editor.toImageDataUrl(context.shapes.map(shape => shape.id as TLShapeId), { format: 'png', background: true, padding: 16 })
      tutorRef.current?.askAboutSelection(image.url)
    } catch {
      tutorRef.current?.askAboutSelection()
    }
  }, [])

  const generateTeachingPlan = useCallback(async (goal?: string) => {
    if (!currentPaper) return
    const paper = currentPaper
    setPlanBusy(true)
    setError('')
    setDiagnostic(null)
    setStatus('The teaching agent is preparing a few diagnostic questions...')
    try {
      const learningGoal = paper.sourceKind === 'topic'
        ? `Understand ${paper.title} end to end, including its foundations, key ideas, evidence, and implications.`
        : goal?.trim() || defaultLearningGoal
      const result = await requestLearningDiagnostic({
        paperTitle: paper.title, sourceKind: paper.sourceKind, learningGoal, pageCount: paper.pageCount, text: paper.text,
        knowledge: learnerKnowledge.slice(0, 100),
        evidence: learnerEvidence.slice(-20),
        priorKnowledge: { propositions: knowledgeGraph.propositions?.slice(-100).map(({ id, concept, statement }) => ({ id, concept, statement })) || [], reasoningLinks: knowledgeGraph.reasoningLinks?.slice(-200).map(({ source, target, relationType, reason }) => ({ source, target, relationType, reason })) || [] },
      })
      if (currentId !== paper.id) return
      setDiagnostic(result)
      setStatus('Answer these short questions so the plan can start from what you understand. You can leave anything blank.')
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
  }, [currentPaper, currentId, knowledgeGraph, learnerKnowledge, learnerEvidence])

  const completeTeachingPlan = useCallback(async (answers: string[]) => {
    if (!currentPaper || !diagnostic) return
    const paper = currentPaper
    setPlanBusy(true)
    setError('')
    setStatus('The teaching agent is building and checking your source-grounded plan...')
    try {
      const nextPlan = await requestAdaptivePlan({
        paperTitle: paper.title, sourceKind: paper.sourceKind, pageCount: paper.pageCount, text: paper.text, diagnostic, answers,
        knowledge: learnerKnowledge.slice(0, 100),
        evidence: learnerEvidence.slice(-20),
        priorKnowledge: { propositions: knowledgeGraph.propositions?.slice(-100).map(({ id, concept, statement }) => ({ id, concept, statement })) || [], reasoningLinks: knowledgeGraph.reasoningLinks?.slice(-200).map(({ source, target, relationType, reason }) => ({ source, target, relationType, reason })) || [] },
      })
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
      setDiagnostic(null)
      setCheckpointIndex(0)
      setTranscript([])
      setTutorStatus('idle')
      setTutorDetail('Plan ready. Start the voice lesson when you are ready to use the microphone.')
      setStatus(`Teaching plan ready for "${paper.title}"`)
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
  }, [currentPaper, currentId, diagnostic, knowledgeGraph, learnerKnowledge, learnerEvidence, selectedSourceIds])
  const adaptTeachingPlan = useCallback(async (review: AnswerReview) => {
    const currentPlan = planRef.current
    if (!currentPaper || !currentPlan) return
    const checkpointIndex = checkpointIndexRef.current
    const completedCount = review.status === 'clear' ? checkpointIndex + 1 : checkpointIndex
    setPlanBusy(true)
    setStatus('Repairing this step and updating what comes next...')
    try {
      const knowledge = knowledgeGraphRef.current
      const nextPlan = await requestAdaptiveRevision({
        paperTitle: currentPaper.title, sourceKind: currentPaper.sourceKind, pageCount: currentPaper.pageCount, text: currentPaper.text,
        currentPlan, completedCount,
        knowledge: latestConceptEvidence(learnerEvidenceRef.current).slice(0, 100),
        evidence: learnerEvidenceRef.current.slice(-20),
        priorKnowledge: {
          propositions: (knowledge.propositions || []).slice(-100).map(({ id, concept, statement }) => ({ id, concept, statement })),
          chains: (knowledge.chains || []).slice(-100).map(({ id, premises, conclusion, reason }) => ({ id, premises, conclusion, reason })),
        },
      })
      const { paper: updated, graph } = await saveLearningPlan(
        currentPaper, nextPlan, graph => recordPlanKnowledge(graph, nextPlan, currentPaper.id, currentPaper.title, currentPaper.sourceSegments), false, completedCount, [currentPaper.id, ...selectedSourceIds.filter(id => id !== currentPaper.id)],
      )
      if (currentId !== currentPaper.id) return
      knowledgeGraphRef.current = graph
      setKnowledgeGraph(graph)
      setPapers(items => items.map(paper => paper.id === updated.id ? updated : paper))
      planRef.current = nextPlan
      checkpointIndexRef.current = completedCount
      setPlan(nextPlan)
      setCheckpointIndex(completedCount)
      setStatus('The remaining lesson now follows your latest answers.')
      setTutorDetail('The upcoming checkpoints were adjusted to your current understanding.')
      tutorRef.current?.updateCheckpointBrief(buildCheckpointBrief(nextPlan, completedCount, graph, learnerEvidenceRef.current, currentPaper.pageCount))
    } catch (reason) {
      const message = errorMessage(reason)
      setError(message)
      setStatus('The current lesson is still available; its route could not be updated.')
    } finally {
      setPlanBusy(false)
    }
  }, [currentPaper, currentId, selectedSourceIds])
  const persistLearningReview = useCallback(async (review: AnswerReview, source: string, checkpointIndex: number, question: string, answer: string, sourcePages: number[]) => {
    if (!currentPaper) throw new Error('No source is selected.')
    const reviewedAt = new Date().toISOString()
    const evidence: LearningEvidence = {
      question, answer, feedback: review.feedback, concepts: review.conceptResults, source,
      sourceId: currentPaper.id, sourceTitle: currentPaper.title, sourcePages,
      sourceRefs: sourcePages.flatMap(page => {
        const segment = currentPaper.sourceSegments?.[page - 1]
        return segment ? [{ sourceId: segment.sourceId || currentPaper.id, sourceTitle: segment.sourceTitle || currentPaper.title, segmentId: segment.id, locator: segment.locator }] : []
      }), reviewedAt,
    }
    const { paper: updated, graph } = await saveLearningOutcome(currentPaper.id,
      graph => graph, previous => ({
        ...previous,
        ...(source.endsWith(' practice') ? { practice: [...(previous.practice || []), { question, answer, review, sourcePages, reviewedAt }].slice(-40) } : { assessments: { ...previous.assessments, [String(checkpointIndex)]: review } }),
        evidence: [...(previous.evidence || []), evidence].slice(-100),
      }), profile => ({ evidence: [...profile.evidence, evidence].slice(-200) }))
    const nextEvidence = [...learnerEvidenceRef.current, evidence].slice(-200)
    learnerEvidenceRef.current = nextEvidence
    setLearnerEvidence(nextEvidence)
    knowledgeGraphRef.current = graph
    setPapers(items => items.map(paper => paper.id === updated.id ? updated : paper))
    setKnowledgeGraph(graph)
    setStatus('Your learning progress was saved on this device.')
    const activePlan = planRef.current
    if (activePlan) tutorRef.current?.updateCheckpointBrief(buildCheckpointBrief(activePlan, checkpointIndex, graph, nextEvidence, currentPaper.pageCount))
  }, [currentPaper])
  const runLearningOperation = useCallback(async <T,>(operation: () => Promise<T>) => {
    if (learningBusyRef.current) throw new Error('Finish the current learning check first.')
    learningBusyRef.current = true
    setLearningBusy(true)
    try { return await operation() }
    finally { learningBusyRef.current = false; setLearningBusy(false) }
  }, [])

  const assessCheckpoint = useCallback((answer: string) => runLearningOperation(async () => {
    const checkpointIndex = checkpointIndexRef.current
    const checkpoint = planRef.current?.sessions[checkpointIndex]
    if (!currentPaper || !checkpoint) throw new Error('Select a lesson checkpoint before checking your answer.')
    const review = await assessAnswer({
      paperTitle: currentPaper.title, question: checkpoint.checkForUnderstanding,
      answer, concepts: checkpoint.concepts, goal: checkpoint.goal,
      sourcePages: checkpoint.sourcePages,
      paperEvidence: readPaperEvidence(currentPaper.text, checkpoint.sourcePages, currentPaper.pageCount),
    })
    await persistLearningReview(review, checkpoint.title, checkpointIndex, checkpoint.checkForUnderstanding, answer, checkpoint.sourcePages)
    const teacherTranscript = transcriptRef.current.slice(checkpointTranscriptStartRef.current).filter(line => line.role === 'Tutor').slice(-24).map(line => line.text).join('\n')
    if (teacherTranscript.length >= 80) {
      try {
        const knowledge = knowledgeGraphRef.current
        const update = await extractTaughtKnowledge({
          paperTitle: currentPaper.title, pageCount: currentPaper.pageCount, text: currentPaper.text,
          checkpoint: { title: checkpoint.title, goal: checkpoint.goal, sourcePages: checkpoint.sourcePages },
          teacherTranscript,
          priorKnowledge: {
            propositions: (knowledge.propositions || []).slice(-100).map(({ id, concept, statement }) => ({ id, concept, statement })),
            chains: (knowledge.chains || []).slice(-100).map(({ id, premises, conclusion, reason }) => ({ id, premises, conclusion, reason })),
          },
        })
        const { paper: updated, graph } = await saveLearningOutcome(currentPaper.id,
          graph => mergeTaughtKnowledge(graph, update, { paperId: currentPaper.id, paperTitle: currentPaper.title, checkpoint: checkpoint.title, segments: currentPaper.sourceSegments }),
          previous => previous,
        )
        if (currentId === currentPaper.id) {
          knowledgeGraphRef.current = graph
          setKnowledgeGraph(graph)
          setPapers(items => items.map(paper => paper.id === updated.id ? updated : paper))
          const activePlan = planRef.current
          if (activePlan) tutorRef.current?.updateCheckpointBrief(buildCheckpointBrief(activePlan, checkpointIndex, graph, learnerEvidenceRef.current, currentPaper.pageCount))
        }
      } catch {
        setStatus('Your answer was saved, but the proposition graph could not be updated from this lesson yet.')
      }
    }
    if (review.status !== 'clear') await adaptTeachingPlan(review)
    return review
  }), [currentPaper, currentId, persistLearningReview, runLearningOperation, adaptTeachingPlan])

  const startPractice = useCallback((checkpoint: { title: string; goal: string; concepts: string[]; sourcePages: number[] }) => runLearningOperation(async () => {
    if (!currentPaper) throw new Error('No source is selected.')
    const paperEvidence = readPaperEvidence(currentPaper.text, checkpoint.sourcePages, currentPaper.pageCount)
    if (!paperEvidence.length) throw new Error('There is no readable text on this checkpoint’s cited segments for practice.')
    return requestPracticeQuestion({
      paperTitle: currentPaper.title, checkpoint,
      paperEvidence,
      knowledge: learnerKnowledge.slice(0, 100),
      previousQuestions: (currentPaper.learningState?.practice || []).map(item => item.question).slice(-20),
      evidence: learnerEvidence.slice(-20),
      priorKnowledge: {
        propositions: (knowledgeGraph.propositions || []).slice(-100).map(({ id, concept, statement }) => ({ id, concept, statement })),
        chains: (knowledgeGraph.chains || []).slice(-100).map(({ id, premises, conclusion, reason }) => ({ id, premises, conclusion, reason })),
      },
    })
  }), [currentPaper, learnerKnowledge, learnerEvidence, knowledgeGraph, runLearningOperation])

  const assessPracticeAnswer = useCallback((question: string, concepts: string[], answer: string, checkpoint: { title: string; goal: string; sourcePages: number[] }) => runLearningOperation(async () => {
    const checkpointIndex = checkpointIndexRef.current
    if (!currentPaper) throw new Error('No source is selected.')
    const review = await assessAnswer({
      paperTitle: currentPaper.title, question, answer, concepts, goal: checkpoint.goal,
      sourcePages: checkpoint.sourcePages,
      paperEvidence: readPaperEvidence(currentPaper.text, checkpoint.sourcePages, currentPaper.pageCount),
    })
    await persistLearningReview(review, `${checkpoint.title} practice`, checkpointIndex, question, answer, checkpoint.sourcePages)
    return review
  }), [currentPaper, currentId, persistLearningReview, runLearningOperation, transcript])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">m</span><span>margin</span></div>
        {currentPaper && <div className="top-center"><span className="tiny-status"><i /> Saved locally</span></div>}
        <div className="top-actions">
          <Button size="sm" onClick={() => { setError(''); setAddOpen(true) }}>Add material</Button>
          <HStack className="style-toggle"><IconButton label={stylePanelOpen ? 'Hide style controls' : 'Show style controls'} tooltip="Style controls" icon="Aa" size="sm" variant={stylePanelOpen ? 'primary' : 'ghost'} aria-expanded={stylePanelOpen} onClick={() => setStylePanelOpen(open => !open)} /></HStack>
          <Button className="icon-button" size="icon-sm" variant="ghost" title="Undo" aria-label="Undo" onClick={() => editorRef.current?.undo()}>↶</Button>
          <Button className="icon-button" size="icon-sm" variant="ghost" title="Redo" aria-label="Redo" onClick={() => editorRef.current?.redo()}>↷</Button>
        </div>
      </header>

      <div className="workspace">
        <aside className="left-rail library-rail">
          <div className="library-heading"><div><span className="section-eyebrow">YOUR LIBRARY</span><b>{papers.length ? `${papers.length} ${papers.length === 1 ? 'source' : 'sources'}` : 'No sources yet'}</b></div></div>
          <div className="rail-divider" />
          {papers.length ? <div className="paper-list">{papers.map((paper, index) => <HStack key={paper.id} gap={1} vAlign="center" style={{ animationDelay: `${index * 30}ms` }} className={`paper-list-item ${paper.id === currentId ? 'selected' : ''}`}><button className="paper-list-select" onClick={() => setCurrentId(paper.id)}><span className="pdf-badge">{(paper.sourceKind || 'pdf').toUpperCase()}</span><span className="paper-list-copy"><b>{paper.title}</b><small>{paper.pageCount} segments - {new Date(paper.importedAt).toLocaleDateString()}</small></span></button><Button aria-label={`Remove ${paper.title}`} title="Remove source" variant="destructive" size="icon-xs" disabled={deletingPaperId === paper.id} onClick={() => void removePaper(paper)}>x</Button></HStack>)}</div> : null}
          
          {currentPaper && papers.length > 1 && <section className="lesson-source-picker"><p className="section-eyebrow">Sources for next lesson</p><HStack gap={1} wrap="wrap">{papers.filter(paper => paper.id !== currentId).map(paper => <Button key={paper.id} size="sm" disabled={planBusy || learningBusy} variant={selectedSourceIds.includes(paper.id) ? "default" : "outline"} aria-pressed={selectedSourceIds.includes(paper.id)} onClick={() => toggleLearningSource(paper.id)}>{selectedSourceIds.includes(paper.id) ? "Included: " : "Include: "}{paper.title}</Button>)}</HStack></section>}
        </aside>

        <section className="canvas-column">
          {currentPaper && (
            <div className="canvas-toolbar">
              <div className="canvas-title"><span className="canvas-dot" /><span>{currentPaper.title}</span><span className="canvas-count">? {currentPaper.pageCount} segments</span></div>
              <div className="canvas-tools">
                <IconButton label="Fit canvas to view" tooltip="Fit canvas" size="sm" variant="secondary" icon="Fit" onClick={() => editorRef.current?.zoomToFit({ animation: { duration: 350 } })} />
                <Button size="sm" disabled={planBusy || learningBusy} onClick={() => void generateTeachingPlan()}>{planBusy ? 'Building plan...' : plan ? 'Rebuild teaching plan' : 'Build teaching plan'}</Button>
              </div>
            </div>
          )}
          <div className={`canvas-area ${dragging ? 'canvas-dragging' : ''}`} onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={onCanvasDrop}>
            {libraryReady && <PaperStyleControls.Provider value={{ open: stylePanelOpen, setOpen: setStylePanelOpen }}><Tldraw key={currentPaper?.id || 'blank'} components={paperCanvasComponents} persistenceKey={currentPaper ? paperCanvasPersistenceKey(currentPaper.id) : 'margin-paper-v2-empty'} onMount={editor => {
              selectionCleanupRef.current?.()
              editorRef.current = editor
              if (currentPaper) initializePaperCanvas(editor, currentPaper)
              const updateSelection = () => setHasSelection(Boolean(getSelectionContext(editor)))
              selectionCleanupRef.current = editor.store.listen(updateSelection)
              updateSelection()
            }} autoFocus /></PaperStyleControls.Provider>}
            {dragging && <div className="canvas-drop-cover" aria-hidden="true"><span>Drop to import</span></div>}
          </div>
          
        </section>

        {currentPaper ? <TutorPanel
          plan={plan}
          diagnostic={diagnostic}
          checkpointIndex={checkpointIndex}
          status={tutorStatus}
          micMuted={tutorMicMuted}
          statusDetail={tutorDetail || error}
          transcript={transcript}
          hasSelection={hasSelection}
          sourceTitle={currentPaper.title}
          sourceKind={currentPaper.sourceKind}
          sourceText={currentPaper.text}
          sourceSegments={currentPaper.sourceSegments || []}
          paperId={currentPaper.id}
          knowledge={knowledgeGraph}
          learningEvidence={learnerEvidence}
          assessment={currentPaper.learningState?.assessments?.[String(checkpointIndex)]}
          learningBusy={learningBusy || planBusy}
          planBusy={planBusy}
          onBuildPlan={goal => void generateTeachingPlan(goal)}
          onCompleteDiagnostic={answers => void completeTeachingPlan(answers)}
          onStart={() => void startTutor()}
          onPause={pauseTutor}
          onToggleMic={toggleTutorMic}
          onResume={resumeTutor}
          onStop={stopTutor}
          onBack={() => selectCheckpoint(checkpointIndex - 1)}
          onSkip={() => selectCheckpoint(checkpointIndex + 1)}
          onSelectCheckpoint={selectCheckpoint}
          onAsk={message => tutorRef.current?.ask(message)}
          onAskSelection={() => void askAboutSelection()}
          onOpenPage={pageNumber => { void showSourcePage(pageNumber).then(result => setTutorDetail(result.message)).catch(reason => setTutorDetail(errorMessage(reason))) }}
          onAssess={assessCheckpoint}
          onStartPractice={startPractice}
          onAssessPractice={assessPracticeAnswer}
        /> : <aside className="paper-panel" aria-hidden="true" />}
      </div>

      <dialog ref={modalRef} className="ingest-dialog" onClose={() => setAddOpen(false)} onClick={event => { if (event.target === modalRef.current) setAddOpen(false) }}>
        <div className="dialog-head"><h2>Bring in learning material.</h2><button className="dialog-close" onClick={() => setAddOpen(false)} aria-label="Close import dialog">x</button></div>
        <p className="dialog-intro">We'll extract selectable text and save it with a new canvas on this device.</p>
        <IntakePanel busy={busy} progress={progress} error={error} onFiles={files => void importFiles(files)} onUrl={url => void importUrl(url)} onTopic={topic => void createTopicLesson(topic)} />
        <p className="dialog-safety">Only public HTTPS links are fetched. Private network addresses are blocked.</p>
      </dialog>
      <div className="status-live" role="status">{status}</div>
    </main>
  )
}
