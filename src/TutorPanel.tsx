import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { ButtonGroup } from '@astryxdesign/core/ButtonGroup'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Section } from '@astryxdesign/core/Section'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Toolbar } from '@astryxdesign/core/Toolbar'
import { VStack } from '@astryxdesign/core/VStack'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs'
import { buildCheckpointBrief, type TeachingPlan } from './lessonAgent'
import type { TutorStatus } from './hybridTutor'
import { defaultLearningGoal, type AnswerReview, type LearningDiagnostic, type LearningStatus, type PracticeCheckpoint, type PracticeQuestion } from './learning'
import { formatSourceLocator, latestConceptEvidence, type KnowledgeGraph, type LearningEvidence, type SourceSegment } from './storage'

type TutorPanelProps = {
  plan: TeachingPlan | null
  diagnostic: LearningDiagnostic | null
  checkpointIndex: number
  status: TutorStatus
  micMuted: boolean
  statusDetail: string
  transcript: Array<{ role: 'Tutor' | 'You'; text: string }>
  hasSelection: boolean
  sourceTitle: string
  sourceKind?: string
  sourceText: string
  sourceSegments: SourceSegment[]
  paperId: string
  knowledge: KnowledgeGraph
  learningEvidence: LearningEvidence[]
  assessment?: AnswerReview
  learningBusy: boolean
  planBusy: boolean
  onBuildPlan: (goal: string) => void
  onCompleteDiagnostic: (answers: string[]) => void
  onStart: () => void
  onPause: () => void
  onPushToTalkStart: () => void
  onPushToTalkEnd: () => void
  onResume: () => void
  onStop: () => void
  onBack: () => void
  onSkip: () => void
  onSelectCheckpoint: (index: number) => void
  onAsk: (message: string) => Promise<void>
  onAskSelection: () => Promise<void>
  onRefreshKnowledgeGraph: () => void
  onOpenPage: (pageNumber: number) => void
  onAssess: (answer: string) => Promise<AnswerReview>
  onStartPractice: (checkpoint: PracticeCheckpoint) => Promise<PracticeQuestion>
  onAssessPractice: (question: string, concepts: string[], answer: string, checkpoint: PracticeCheckpoint) => Promise<AnswerReview>
}

const statusLabels: Record<TutorStatus, string> = {
  idle: 'Ready to teach', connecting: 'Connecting voice', listening: 'Ready for push-to-talk', speaking: 'Speaking',
  drawing: 'Drawing on canvas', paused: 'Paused', stopped: 'Stopped', error: 'Needs attention',
}

export function TutorPanel(props: TutorPanelProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<string[]>([])
  const [assessmentError, setAssessmentError] = useState('')
  const [practiceQuestion, setPracticeQuestion] = useState<PracticeQuestion | null>(null)
  const [practiceAnswer, setPracticeAnswer] = useState('')
  const [practiceReview, setPracticeReview] = useState<AnswerReview | null>(null)
  const [practiceError, setPracticeError] = useState('')
  const [practiceBusy, setPracticeBusy] = useState(false)
  const [askBusy, setAskBusy] = useState(false)
  const [askError, setAskError] = useState('')
  const suppressPushToTalkClick = useRef(false)
  const checkpoint = props.plan?.sessions[props.checkpointIndex]
  const brief = props.plan ? buildCheckpointBrief(props.plan, props.checkpointIndex, props.knowledge, props.learningEvidence, props.sourceSegments.length) : undefined
  const concepts = brief?.concepts || []
  const topicLesson = props.sourceKind === 'topic'
  const lessonGoal = topicLesson
    ? `Understand ${props.sourceTitle} end to end, including its foundations, key ideas, evidence, and implications.`
    : defaultLearningGoal
  const prerequisites = brief?.prerequisites || []
  const propositions = props.knowledge.propositions || []
  const learnerConcepts = latestConceptEvidence(props.learningEvidence)
  const locatorLabel = (segmentIndex: number) => formatSourceLocator(props.sourceSegments[segmentIndex - 1]?.locator || { kind: 'pdf-page', page: segmentIndex })
  const propositionNames = new Map(propositions.map(item => [item.id, item.concept]))
  const reviewTargets = [...new Map(prerequisites
    .filter(link => link.knowledgeStatus === 'review' && link.taughtAt >= 0 && link.taughtAt < props.checkpointIndex)
    .map(link => [link.id, link])).values()]

  const knowledgeGraphPanel = <VStack gap={2}>
    <Text type="supporting">{propositions.length} concepts · {(props.knowledge.reasoningLinks || []).length + (props.knowledge.chains || []).length} relationships</Text>
    {propositions.length ? propositions.map(item => <Section key={item.id} variant="muted" padding={2}>
      <VStack gap={1}>
        <Text type="label">{item.concept}</Text>
        <Text type="body">{item.statement}</Text>
        {item.sources.map((source, sourceIndex) => <VStack key={`${item.id}-${source.sourceId || source.paperId}-${sourceIndex}`} gap={0.5}>
          <Text type="supporting">{source.kind === 'taught' ? 'Tutor explanation: ' : source.kind === 'planned' ? 'Planned material: ' : 'Source: '}{source.sourceRefs?.map(ref => `${ref.sourceTitle || source.sourceTitle || source.paperTitle} · ${formatSourceLocator(ref.locator)}`).join(', ') || `${source.sourceTitle || source.paperTitle} · ${source.refs?.map(formatSourceLocator).join(', ') || source.pages.map(locatorLabel).join(', ')}`}</Text>
          {source.sourceRefs ? <HStack gap={1} wrap="wrap">{source.sourceRefs.map(ref => {
            const segmentIndex = props.sourceSegments.findIndex(segment => segment.id === ref.segmentId && segment.sourceId === ref.sourceId)
            return segmentIndex < 0 ? null : <Button key={`${ref.sourceId}-${ref.segmentId}`} label={`Open ${item.concept} source, ${formatSourceLocator(ref.locator)}`} size="sm" variant="secondary" onClick={() => props.onOpenPage(segmentIndex + 1)} />
          })}</HStack> : source.paperId === props.paperId && <HStack gap={1} wrap="wrap">{source.pages.map((segmentIndex, index) => <Button key={`${segmentIndex}-${index}`} label={`Open ${item.concept} source, ${formatSourceLocator(source.refs?.[index] || props.sourceSegments[segmentIndex - 1]?.locator || { kind: 'pdf-page', page: segmentIndex })}`} size="sm" variant="secondary" onClick={() => props.onOpenPage(segmentIndex)} />)}</HStack>}
        </VStack>)}
      </VStack>
    </Section>) : <Text type="supporting">The lesson plan has no source-linked concepts yet.</Text>}
    {(props.knowledge.chains || []).length > 0 && <VStack gap={0.5}>
      <Text type="label">Reasoning chains</Text>
      {(props.knowledge.chains || []).map(chain => <Text key={chain.id} type="supporting">{chain.premises.map(id => propositionNames.get(id) || id).join(' + ')} leads to {propositionNames.get(chain.conclusion) || chain.conclusion}: {chain.reason} ({chain.sources.map(source => `${source.sourceTitle || source.paperTitle}, ${source.refs?.map(formatSourceLocator).join(', ') || source.pages.map(locatorLabel).join(', ')}`).join('; ')})</Text>)}
    </VStack>}
    {(props.knowledge.reasoningLinks || []).map(link => <Text key={link.id} type="supporting">{propositionNames.get(link.source) || link.source} {link.relationType === 'explicit' ? 'is explicitly connected to' : 'helps explain'} {propositionNames.get(link.target) || link.target}: {link.reason}</Text>)}
  </VStack>
  const running = ['listening', 'speaking', 'drawing'].includes(props.status)
  const canAsk = Boolean(props.plan) && props.status !== 'connecting' && !props.learningBusy
  const learningStatusLabels: Record<LearningStatus, string> = { clear: 'Clear', partial: 'Developing', review: 'Needs review' }

  useEffect(() => {
    setAnswer('')
    setAssessmentError('')
    setPracticeQuestion(null)
    setPracticeAnswer('')
    setPracticeReview(null)
    setPracticeError('')
  }, [props.checkpointIndex, props.plan])

  useEffect(() => setDiagnosticAnswers(props.diagnostic?.questions.map(() => '') || []), [props.diagnostic])

  const submitQuestion = async () => {
    const message = question.trim()
    if (!message || !canAsk || askBusy) return
    setAskBusy(true)
    setAskError('')
    try {
      await props.onAsk(message)
      setQuestion('')
    } catch (reason) {
      setAskError(reason instanceof Error ? reason.message : 'The tutor could not answer that question.')
    } finally {
      setAskBusy(false)
    }
  }
  const askAboutSelection = async () => {
    if (!canAsk || askBusy) return
    setAskBusy(true)
    setAskError('')
    try { await props.onAskSelection() }
    catch (reason) { setAskError(reason instanceof Error ? reason.message : 'The tutor could not explain that selection.') }
    finally { setAskBusy(false) }
  }

  const beginPushToTalk = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    suppressPushToTalkClick.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    props.onPushToTalkStart()
  }
  const endPushToTalk = () => {
    props.onPushToTalkEnd()
    window.setTimeout(() => { suppressPushToTalkClick.current = false }, 0)
  }
  const handlePushToTalkKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    event.preventDefault()
    if (event.repeat) return
    suppressPushToTalkClick.current = true
    props.onPushToTalkStart()
  }
  const handlePushToTalkKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return
    event.preventDefault()
    endPushToTalk()
  }
  const handlePushToTalkClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (suppressPushToTalkClick.current) { suppressPushToTalkClick.current = false; return }
    if (event.detail !== 0) return
    if (props.micMuted) props.onPushToTalkStart()
    else props.onPushToTalkEnd()
  }

  useEffect(() => {
    const release = () => { if (!props.micMuted) props.onPushToTalkEnd() }
    window.addEventListener('blur', release)
    return () => window.removeEventListener('blur', release)
  }, [props.micMuted, props.onPushToTalkEnd])

  const beginPractice = async () => {
    if (!checkpoint) return
    setPracticeBusy(true)
    setPracticeError('')
    try {
      const next = await props.onStartPractice({ title: checkpoint.title, goal: checkpoint.goal, concepts: checkpoint.concepts, sourcePages: checkpoint.sourcePages })
      setPracticeQuestion(next)
      setPracticeAnswer('')
      setPracticeReview(null)
    } catch (reason) {
      setPracticeError(reason instanceof Error ? reason.message : 'A practice question could not be created.')
    } finally {
      setPracticeBusy(false)
    }
  }

  const submitPractice = async () => {
    if (!checkpoint || !practiceQuestion || !practiceAnswer.trim()) return
    setPracticeBusy(true)
    setPracticeError('')
    try {
      setPracticeReview(await props.onAssessPractice(practiceQuestion.question, practiceQuestion.concepts, practiceAnswer, { title: checkpoint.title, goal: checkpoint.goal, concepts: checkpoint.concepts, sourcePages: practiceQuestion.sourcePages }))
    } catch (reason) {
      setPracticeError(reason instanceof Error ? reason.message : 'Your practice answer could not be reviewed.')
    } finally {
      setPracticeBusy(false)
    }
  }

  return (
    <aside className={`paper-panel tutor-panel ${mobileExpanded ? 'mobile-expanded' : 'mobile-collapsed'}`} aria-label="Voice tutor">
      <Toolbar
        label="Tutor status"
        size="sm"
        dividers={['bottom']}
        startContent={<VStack gap={0.5}><Heading level={2}>Tutor</Heading><Text type="supporting">{statusLabels[props.status]}</Text></VStack>}
        endContent={<HStack gap={1} vAlign="center">
          {checkpoint && <Text type="supporting">{props.checkpointIndex + 1} / {props.plan!.sessions.length}</Text>}
          <HStack className="tutor-panel-toggle" gap={0}>
            <Button label={mobileExpanded ? 'Hide tutor' : 'Show tutor'} size="sm" variant="ghost" aria-expanded={mobileExpanded} aria-controls="tutor-panel-content" onClick={() => setMobileExpanded(open => !open)} />
          </HStack>
        </HStack>}
      />

      {!props.plan ? (
        <VStack id="tutor-panel-content" className="tutor-panel-body" gap={3} padding={3} isScrollable>
          {props.diagnostic ? <Section variant="transparent">
            <form onSubmit={event => { event.preventDefault(); props.onCompleteDiagnostic(diagnosticAnswers) }}>
              <VStack gap={3}>
                <Heading level={3}>Where should we start?</Heading>
                <Text type="body">Answer in your own words. These questions help the teaching agent find your starting point; leave any blank if you are unsure.</Text>
                {props.diagnostic.questions.map((item, index) => <VStack key={`${item.concept}-${index}`} gap={1}>
                  <Text type="label">{item.concept}</Text>
                  <TextArea label={item.question} value={diagnosticAnswers[index] || ''} maxLength={4000} placeholder="What do you understand so far, and why?" onChange={value => setDiagnosticAnswers(current => current.map((answer, answerIndex) => answerIndex === index ? value : answer))} isDisabled={props.planBusy} width="100%" />
                </VStack>)}
                <Button label="Build my teaching plan" type="submit" variant="primary" isLoading={props.planBusy} isDisabled={props.planBusy} />
              </VStack>
            </form>
          </Section> : <Section variant="transparent">
            <VStack gap={3}>
              <Heading level={3}>Build the lesson first</Heading>
              <Text type="body">Course goal: {lessonGoal} {topicLesson ? 'The tutor plans the lesson directly from your topic and adds verified background sources when available.' : 'The plan starts from this material and uses reputable outside sources only for needed background.'}</Text>
              <Button label="Start teaching plan" variant="primary" isLoading={props.planBusy} isDisabled={props.learningBusy} onClick={() => props.onBuildPlan(lessonGoal)} />
            </VStack>
          </Section>}
        </VStack>
      ) : (
        <Tabs defaultValue="lesson" className="tutor-tabs" onValueChange={value => { if (value === 'knowledge') props.onRefreshKnowledgeGraph() }}>
          <TabsList aria-label="Lesson views" className="tutor-tab-list">
            <TabsTrigger value="lesson">Lesson</TabsTrigger>
            <TabsTrigger value="knowledge">Knowledge graph</TabsTrigger>
          </TabsList>
          <TabsContent value="lesson" className="tutor-tab-content">
          <VStack id="tutor-panel-content" className="tutor-panel-body" gap={3} padding={3} isScrollable>
          <ProgressBar label="Lesson progress" value={props.checkpointIndex + 1} max={props.plan.sessions.length} hasValueLabel formatValueLabel={(value, max) => `Checkpoint ${value} of ${max}`} />

          <Section variant="transparent" padding={0}>
            <VStack gap={2}>
              <HStack gap={2} hAlign="between" vAlign="center">
                <Heading level={3}>Live conversation</Heading>
                <Button label="Ask about selection" size="sm" variant="secondary" isDisabled={!props.hasSelection || !canAsk || askBusy} tooltip={!props.hasSelection ? 'Select or circle something on the canvas first.' : !canAsk ? 'Wait for the tutor to finish responding.' : undefined} onClick={() => void askAboutSelection()} />
              </HStack>
              <ol className="tutor-transcript" aria-live="polite">
                {props.transcript.length ? props.transcript.map((line, index) => <li key={`${index}-${line.text}`}><Text type="label">{line.role}</Text><Text type="body">{line.text}</Text></li>) : <li><Text type="supporting">Ask a text question, or start the voice lesson and hold the microphone button to speak.</Text></li>}
              </ol>
              <form onSubmit={event => { event.preventDefault(); void submitQuestion() }}>
                <HStack gap={1} vAlign="end">
                  <TextInput label="Ask the tutor" isLabelHidden value={question} placeholder="Ask why, how, or what this means…" enterKeyHint="send" onChange={setQuestion} onEnter={() => void submitQuestion()} width="100%" isDisabled={!canAsk || askBusy} disabledMessage="Wait for the tutor to finish responding." />
                  <Button label="Send" type="submit" size="sm" variant="primary" isLoading={askBusy} isDisabled={!canAsk || askBusy || !question.trim()} />
                </HStack>
              </form>
              {askError && <Text type="supporting" color="accent">{askError}</Text>}
            </VStack>
          </Section>

          <Collapsible trigger={`All checkpoints · ${props.plan.sessions.length}`} defaultIsOpen={false}>
            <nav aria-label="Lesson checkpoints">
              <ol className="checkpoint-list">
                {props.plan.sessions.map((lesson, index) => (
                  <li key={`${index}-${lesson.title}`}>
                    <button type="button" className={index === props.checkpointIndex ? 'checkpoint-button active' : 'checkpoint-button'} aria-current={index === props.checkpointIndex ? 'step' : undefined} onClick={() => props.onSelectCheckpoint(index)}>
                      <Text type="label">{index + 1}. {lesson.title}</Text>
                      <Text type="supporting">{lesson.minutes} min</Text>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </Collapsible>

          {checkpoint && <Section variant="muted" padding={3}>
            <VStack gap={2}>
              <Text type="supporting">CURRENT CHECKPOINT</Text>
              <Heading level={3}>{checkpoint.title}</Heading>
              <Text type="body">{checkpoint.goal}</Text>
              {concepts.map(concept => <Text key={concept.id} type="supporting">{concept.name}: {concept.explanation} · {concept.sourcePages.map(locatorLabel).join(', ')}</Text>)}
              {prerequisites.map((prerequisite, index) => <VStack key={`${prerequisite.id}-${prerequisite.dependentName}-${index}`} gap={0.5}>
                <Text type="supporting">{prerequisite.relationType === 'explicit' ? 'Explicit source relationship' : 'Suggested learning prerequisite'}: {prerequisite.name} helps explain {prerequisite.dependentName}. {prerequisite.reason} {prerequisite.evidencePages.length ? `Evidence: ${prerequisite.evidencePages.map(locatorLabel).join(', ')}.` : 'Source evidence unavailable for this saved lesson.'}</Text>
                {prerequisite.evidencePages.length > 0 && <HStack gap={1} wrap="wrap">{prerequisite.evidencePages.map((segmentIndex, index) => <Button key={`${segmentIndex}-${index}`} label={`Open prerequisite evidence, ${locatorLabel(segmentIndex)}`} size="sm" variant="secondary" onClick={() => props.onOpenPage(segmentIndex)} />)}</HStack>}
              </VStack>)}
              <Text type="supporting">Source locations: {checkpoint.sourcePages.map(locatorLabel).join(', ')} · {checkpoint.diagrams.length} optional diagrams</Text>
              <Text type="supporting">Inspect: {checkpoint.pageFocus}</Text>
              <HStack gap={1} wrap="wrap">
                {checkpoint.sourcePages.map((segmentIndex, index) => <Button key={`${segmentIndex}-${index}`} label={`Open ${locatorLabel(segmentIndex)}`} size="sm" variant="secondary" onClick={() => props.onOpenPage(segmentIndex)} />)}
              </HStack>
            </VStack>
          </Section>}

          {checkpoint?.backgroundNotes && <Section variant="muted" padding={3}>
            <VStack gap={1}>
              <Text type="label">Background context from outside sources</Text>
              <Text type="body">{checkpoint.backgroundNotes}</Text>
              {(checkpoint.backgroundSources || []).map(source => <Text key={source.url} type="supporting"><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a> — {source.relevance}</Text>)}
            </VStack>
          </Section>}

          {reviewTargets.map(target => <Section key={target.id} variant="muted" padding={2}>
            <VStack gap={1}>
              <Text type="supporting">This checkpoint builds on {target.name}, which your last answer marked for review. {target.reason} {target.evidencePages.length ? `Evidence: segments ${target.evidencePages.join(', ')}.` : ''}</Text>
              <Button label={`Review ${target.name}`} size="sm" variant="secondary" onClick={() => props.onSelectCheckpoint(target.taughtAt)} />
            </VStack>
          </Section>)}

          {checkpoint && <Section variant="transparent" padding={0}>
            <VStack gap={2}>
              <Heading level={3}>Check your understanding</Heading>
              <Text type="body">{checkpoint.checkForUnderstanding}</Text>
              <form onSubmit={event => {
                event.preventDefault()
                setAssessmentError('')
                void props.onAssess(answer).catch(reason => setAssessmentError(reason instanceof Error ? reason.message : 'Your answer could not be reviewed.'))
              }}>
                <VStack gap={2}>
                  <TextArea label="Explain it in your own words" value={answer} maxLength={4000} placeholder="Write what you think is happening and why…" onChange={setAnswer} isDisabled={props.learningBusy} disabledMessage="Wait for the current learning check to finish." width="100%" />
                  <Button label="Check my answer" type="submit" variant="primary" isLoading={props.learningBusy} isDisabled={!answer.trim() || props.learningBusy} />
                </VStack>
              </form>
              {assessmentError && <Text type="supporting" color="accent">{assessmentError}</Text>}
              {props.assessment && <Section variant="muted" padding={2}>
                <VStack gap={1}>
                  <Text type="label">Last check · {props.assessment.status === 'clear' ? 'Clear understanding' : props.assessment.status === 'partial' ? 'Developing understanding' : 'Review recommended'}</Text>
                  <Text type="body">{props.assessment.feedback}</Text>
                  {props.assessment.conceptResults.map(result => <Text key={result.concept} type="supporting">{result.concept}: {learningStatusLabels[result.status]}</Text>)}
                </VStack>
              </Section>}
            </VStack>
          </Section>}

          {checkpoint && <Section variant="transparent" padding={0}>
            <VStack gap={2}>
              <Heading level={3}>Retrieval practice</Heading>
              <Text type="supporting">Try a fresh problem without opening the source page. Your result updates your local learning map.</Text>
              {!practiceQuestion ? <Button label="Start a practice problem" variant="secondary" isLoading={practiceBusy} isDisabled={props.learningBusy || practiceBusy} onClick={() => void beginPractice()} /> : <>
                <Text type="body">{practiceQuestion.question}</Text>
                <HStack gap={1} vAlign="center"><Text type="supporting">Paper sources:</Text>{practiceQuestion.sourcePages.map(page => <Button key={page} label={`Page ${page}`} size="sm" variant="secondary" onClick={() => props.onOpenPage(page)} />)}</HStack>
                <Collapsible trigger="Show a hint" defaultIsOpen={false}><Text type="supporting">{practiceQuestion.hint}</Text></Collapsible>
                <form onSubmit={event => { event.preventDefault(); void submitPractice() }}>
                  <VStack gap={2}>
                    <TextArea label="Your practice answer" value={practiceAnswer} maxLength={4000} placeholder="Work through the problem in your own words…" onChange={setPracticeAnswer} isDisabled={practiceBusy || props.learningBusy} width="100%" />
                    {!practiceReview ? <Button label="Check practice answer" type="submit" variant="primary" isLoading={practiceBusy || props.learningBusy} isDisabled={!practiceAnswer.trim() || practiceBusy || props.learningBusy} /> : <>
                      <Section variant="muted" padding={2}><VStack gap={1}>
                        <Text type="label">{practiceReview.status === 'clear' ? 'Clear understanding' : practiceReview.status === 'partial' ? 'Developing understanding' : 'Review recommended'}</Text>
                        <Text type="body">{practiceReview.feedback}</Text>
                      </VStack></Section>
                      <Button label="Try another problem" variant="secondary" isLoading={practiceBusy} isDisabled={props.learningBusy || practiceBusy} onClick={() => void beginPractice()} />
                    </>}
                  </VStack>
                </form>
              </>}
              {practiceError && <Text type="supporting" color="accent">{practiceError}</Text>}
            </VStack>
          </Section>}

          <ButtonGroup label="Lesson playback" size="md">
            <IconButton label="Previous checkpoint" tooltip="Previous checkpoint" icon="←" variant="secondary" isDisabled={props.checkpointIndex === 0} onClick={props.onBack} />
            {running && <Button label={props.micMuted ? 'Hold to talk' : 'Release to send'} size="sm" variant={props.micMuted ? 'secondary' : 'primary'} aria-pressed={!props.micMuted} style={{ touchAction: 'none' }} onPointerDown={beginPushToTalk} onPointerUp={endPushToTalk} onPointerCancel={endPushToTalk} onLostPointerCapture={endPushToTalk} onKeyDown={handlePushToTalkKeyDown} onKeyUp={handlePushToTalkKeyUp} onClick={handlePushToTalkClick} onContextMenu={event => event.preventDefault()} />}
            {props.status === 'paused' ?
              <IconButton label="Resume lesson" tooltip="Resume lesson" icon="▶" variant="primary" onClick={props.onResume} /> : running ?
              <IconButton label="Pause lesson" tooltip="Pause lesson" icon="Ⅱ" variant="primary" onClick={props.onPause} /> :
              <IconButton label="Start voice lesson" tooltip="Start voice lesson" icon="▶" variant="primary" isLoading={props.status === 'connecting'} onClick={props.onStart} />}
            <IconButton label="Skip checkpoint" tooltip="Skip checkpoint" icon="→" variant="secondary" isDisabled={props.checkpointIndex >= props.plan.sessions.length - 1} onClick={props.onSkip} />
            {props.status !== 'idle' && props.status !== 'stopped' && <IconButton label="Stop conversation" tooltip="Stop conversation" icon="■" variant="secondary" onClick={props.onStop} />}
          </ButtonGroup>

          {props.statusDetail && <Text type="supporting" color={props.status === 'error' ? 'accent' : 'secondary'}>{props.statusDetail}</Text>}

          <Collapsible trigger="Source and privacy" defaultIsOpen={false}>
            <VStack gap={1} paddingBlock={2}>
              <Text type="supporting">Building a plan sends extracted source text and recent learner evidence to your configured OpenAI project. Answers you submit for feedback and practice are sent there too. OCR and voice recognition run on this device; their model files may download during setup. Microphone audio is captured only while you hold the push-to-talk control, then segmented by local VAD and transcribed locally. Transcript text—not microphone audio—is sent to the OpenAI Responses API. Text questions send the current checkpoint’s cited segments; selected canvas images are sent only when you ask about a selection.</Text>
              <Text type="supporting" maxLines={5}>{props.sourceText}</Text>
            </VStack>
          </Collapsible>

          <Collapsible trigger={`Learner evidence · ${learnerConcepts.length} concepts`} defaultIsOpen={false}>
            <VStack gap={2} paddingBlock={2}>
              <Text type="supporting">These dated answer reviews help future teaching adapt. They are evidence about your current understanding, not facts in the knowledge graph.</Text>
              {learnerConcepts.length ? <ol className="knowledge-list">
                {learnerConcepts.slice(0, 30).map(item => <li key={item.concept}>
                  <Text type="label">{item.concept}</Text>
                  <Text type="supporting">Latest review: {learningStatusLabels[item.status]}</Text>
                </li>)}
              </ol> : <Text type="supporting">Submit an answer or practice response to start building learner evidence.</Text>}
            </VStack>
          </Collapsible>
          </VStack>
          </TabsContent>
          <TabsContent value="knowledge" className="tutor-tab-content">
            <VStack className="tutor-panel-body knowledge-graph-tab" gap={3} padding={3} isScrollable>
              <Heading level={3}>Knowledge graph</Heading>
              <Text type="supporting">Concepts and relationships from this lesson, with links to their source segments.</Text>
              {knowledgeGraphPanel}
            </VStack>
          </TabsContent>
        </Tabs>
      )}
    </aside>
  )
}
