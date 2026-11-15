import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { Button } from './components/ui/button'
import { Paper } from './components/ui/paper'
import { LogoMark } from './Logo'
import { WidgetCard, type WidgetData } from './lessonWidgets'
import './landing.css'

gsap.registerPlugin(ScrollTrigger)

/** Idea cards on the board, in world units (the scene is drawn on a 640x520 desk). Each idea lifts out of a passage in the paper. */
const IDEAS = [
  { id: 'roots', from: '.ls-doc mark', x: -40, y: 10, w: 200, label: 'Fungal threads link neighbouring roots' },
  { id: 'feed', from: '.ls-doc p:nth-of-type(5) mark', x: 470, y: 40, w: 196, label: 'Older trees feed shaded seedlings' },
  { id: 'trade', from: '.ls-doc p:nth-of-type(4) mark', x: 440, y: 380, w: 200, label: 'Sugar and nitrogen travel the links' },
] as const
const HUB = { x: 190, y: 190, w: 220 }

function pin(card: { x: number; y: number; w: number }) {
  return { x: card.x + card.w / 2, y: card.y + 9 }
}

/** A slack string between two pins, sagging under its own weight. */
function stringPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const sag = Math.min(46, Math.hypot(b.x - a.x, b.y - a.y) * 0.16)
  return `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}`
}

const STRINGS = [
  ...IDEAS.map(idea => stringPath(pin(HUB), pin(idea))),
  stringPath(pin(IDEAS[1]), pin(IDEAS[2])),
]

const CHAPTERS = [
  {
    step: 'Add anything', title: 'Bring anything you learn from',
    body: 'Slide decks, PDFs, recordings, spreadsheets, screenshots, notes, even code. Audio gets transcribed, images get read, and everything is indexed so each answer stays grounded and cited.',
  },
  {
    step: 'Agents team up', title: 'Agents that build on each other',
    body: 'Litter-ally orchestrates a team of AI agents that share one living model of what you know. A diagnostic agent maps your starting point, the planner builds your path on top of it, the tutor teaches, and every lesson feeds back so the next step gets smarter.',
  },
  {
    step: 'Pin it together', title: 'Ideas, pinned together',
    body: 'A synthesis agent builds on everything the team has learned, compares your sources and pins the key ideas to one board. Red string shows how they connect: your knowledge graph at a glance.',
  },
]

/** Who it's for. Each card gets a small ink sketch of the job it does. */
const USES = [
  {
    title: 'A tutor for anything you study',
    body: 'Stuck on a lecture, a slide deck or a dense chapter? Start a lesson and the AI tutor teaches it step by step, by text or voice, checks your understanding at each checkpoint, and shows where in your source every answer comes from.',
    art: <>
      <rect x="8" y="8" width="38" height="50" rx="2" />
      <path d="M15 20h24M15 28h24M15 36h16" />
      <path d="M58 14h50a6 6 0 0 1 6 6v14a6 6 0 0 1-6 6H76l-10 9v-9h-8a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6z" />
      <path d="M64 24h36M64 31h24" />
    </>,
  },
  {
    title: 'Order for a pile of sources',
    body: 'Put everything for a course, thesis or project into one workspace: papers, recordings, decks and notes side by side. Each source is summarized and its key ideas pulled out, then a synthesis agent maps how they all relate.',
    art: <>
      <rect x="6" y="20" width="26" height="34" rx="2" />
      <rect x="47" y="8" width="26" height="34" rx="2" />
      <rect x="88" y="22" width="26" height="34" rx="2" />
      <path className="ls-use-string" d="M19 22Q40 30 60 10M60 10Q82 30 101 24M19 22Q60 50 101 24" />
    </>,
  },
  {
    title: 'A crash course in a new field',
    body: 'New to a subject? The agents first find out what you already know, then build an adaptive learning path through your sources and re-plan as you master each concept.',
    art: <>
      <path d="M8 54C30 54 30 34 52 34S74 14 96 14" strokeDasharray="4 5" />
      <circle cx="8" cy="54" r="5" /><circle cx="52" cy="34" r="5" /><circle cx="96" cy="14" r="5" />
      <path d="M96 9V-2l14 5-14 5" />
    </>,
  },
]

/** Real lesson widgets lying on the desk in the hero, filled from the paper on it: what the agents hand back from a source.
    Positions are in desk units; they fill in on load like they do in a lesson, then clear away when the story starts. */
const HERO_WIDGETS: Array<{ id: string; x: number; y: number; w: number; h: number; tilt: number; data: WidgetData }> = [
  { id: 'shade', x: -160, y: -150, w: 300, h: 210, tilt: -4, data: {
    kind: 'bar', title: 'Sugar to seedlings', labels: ['Sun', 'Partial', 'Shade'],
    series: [{ name: 'Share of carbon', values: [4, 9, 16] }], rows: [], unit: '%' } },
  { id: 'figures', x: 175, y: -215, w: 260, h: 150, tilt: 3, data: {
    kind: 'stats', title: 'From p. 4', labels: ['trees on one fir', 'seedlings fed'],
    series: [{ name: 'Figures', values: [47, 12] }], rows: [], unit: '' } },
  { id: 'growth', x: -180, y: 110, w: 290, h: 160, tilt: 2, data: {
    kind: 'timeline', title: 'A shaded seedling', labels: [], series: [],
    rows: [['Year 1', 'Fungi link its roots'], ['Year 3', 'Fed by the old fir'], ['Year 8', 'Reaches the light']], unit: '' } },
]

/** Desk-scene camera stops: lying on the desk, reading, asking, then looking down at the board. */
const CAMERA = {
  hero: { rotationX: 56, rotationZ: -24, x: -10, y: 20, scale: 1 },
  read: { rotationX: 14, rotationZ: -4, x: 0, y: 0, scale: 1 },
  ask: { rotationX: 22, rotationZ: 3, x: 30, y: -6, scale: 0.96 },
  board: { rotationX: 42, rotationZ: 10, x: 0, y: 10, scale: 0.9 },
}

type LandingProps = {
  /** The account form. Rendered as the last screen of the page. */
  children: ReactNode
  onSignIn: () => void
}

export function Landing({ children, onSignIn }: LandingProps) {
  const root = useRef<HTMLElement>(null)
  const lenisRef = useRef<Lenis | null>(null)
  // How far the hero widgets have filled in: widget i shows min(1, fill - i). Full when motion is reduced.
  const [fill, setFill] = useState(HERO_WIDGETS.length)

  useLayoutEffect(() => {
    const el = root.current!
    const stage = el.querySelector<HTMLElement>('.ls-stage')!
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect()
      stage.style.setProperty('--fit', String(Math.min(width / 720, height / 600, 1.25)))
    }
    fit()
    const resize = new ResizeObserver(fit)
    resize.observe(stage)

    const motion = gsap.matchMedia(el)
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      el.classList.add('is-scrolly')
      const lenis = new Lenis({ anchors: true, lerp: 0.09 })
      lenisRef.current = lenis
      lenis.on('scroll', ScrollTrigger.update)
      const tick = (time: number) => lenis.raf(time * 1000)
      gsap.ticker.add(tick)
      gsap.ticker.lagSmoothing(0)

      const q = gsap.utils.selector(el)
      const world = q('.ls-world')
      const marks = q('.ls-doc mark')
      const doc = el.querySelector<HTMLElement>('.ls-doc')!
      const ideaCards = q('.ls-idea:not(.ls-hub)')
      const strings = q('.ls-string path')

      // Hero state: everything flat on the desk, nothing asked yet.
      gsap.set(world, CAMERA.hero)
      const filling = { value: 0 }
      setFill(0)
      // GSAP folds the CSS translate/rotate base pose into its own transform, so lifted objects get explicit depths here.
      gsap.set('.ls-note', { z: 8, rotationX: 0, rotationZ: 5, x: 50, y: 130 })
      gsap.set('.ls-pencil', { z: 5, rotationZ: -14 })
      gsap.set('.ls-answer', { x: 260, z: 120, autoAlpha: 0, rotationZ: 6 })
      gsap.set('.ls-sheet-2', { rotationZ: 1.5, x: 6 })
      gsap.set('.ls-sheet-3', { rotationZ: -1, x: -4 })
      gsap.set('.ls-steps', { autoAlpha: 0 })
      gsap.set(q('.ls-chapter'), { autoAlpha: 0, y: 26 })
      gsap.set(q('.ls-step'), { '--on': 0 })

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: '.ls-pin', start: 'top top', end: '+=340%', pin: true, scrub: 0.9,
          invalidateOnRefresh: true, anticipatePin: 1,
        },
      })
      const step = (index: number, at: number) => {
        tl.to(q('.ls-step')[index], { '--on': 1, duration: 0.4 }, at)
        if (index > 0) tl.to(q('.ls-step')[index - 1], { '--on': 0.35, duration: 0.4 }, at)
      }
      const chapter = (index: number, at: number) => {
        tl.to(q('.ls-chapter')[index], { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out' }, at)
        if (index > 0) tl.to(q('.ls-chapter')[index - 1], { autoAlpha: 0, y: -26, duration: 0.5, ease: 'power1.in' }, at - 0.35)
      }

      // 1. Bring a source: the camera lifts off the desk to read the page.
      tl.to('.ls-hero-copy', { autoAlpha: 0, y: -50, duration: 0.8, ease: 'power1.in' }, 0)
        .to(q('.ls-widget'), { autoAlpha: 0, z: 60, x: (index: number) => [-140, 0, -160][index], y: (index: number) => [0, -140, 0][index], duration: 0.8, ease: 'power1.in' }, 0)
        .fromTo('.ls-cue', { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.3 }, 0)
        .to('.ls-steps', { autoAlpha: 1, duration: 0.5 }, 0.6)
        .to(world, { ...CAMERA.read, duration: 1.8, ease: 'power2.inOut' }, 0)
        .to('.ls-sheet-2', { rotationZ: 4, x: 22, y: 8, duration: 1.4, ease: 'power2.out' }, 0.3)
        .to('.ls-sheet-3', { rotationZ: -3.5, x: -18, y: 12, duration: 1.4, ease: 'power2.out' }, 0.3)
        .fromTo(q('.ls-media'), { x: 0, rotationZ: 0 }, { x: 26, rotationZ: 5, duration: 1.4, ease: 'power2.out' }, 0.3)
        .to('.ls-pencil', { x: -6, y: 4, rotationZ: -6, duration: 1.6, ease: 'power2.inOut' }, 0.2)
      chapter(0, 0.7)
      step(0, 0.7)

      // 2. Ask what matters: lines get highlighted, the question peels off, the answer lands with its page reference.
      chapter(1, 2.7)
      step(1, 2.7)
      tl.to(world, { ...CAMERA.ask, duration: 2.6, ease: 'power1.inOut' }, 2.4)
      marks.forEach((mark, index) => tl.fromTo(mark, { '--hl': 0 }, { '--hl': 1, duration: 0.55, ease: 'power1.inOut' }, 2.7 + index * 0.45))
      tl.to('.ls-note', { z: 90, rotationX: -14, rotationZ: 6, x: 80, y: 120, duration: 1.1, ease: 'power2.out' }, 3.5)
        .to('.ls-answer', { autoAlpha: 1, x: 0, z: 120, rotationZ: -2, duration: 1.2, ease: 'power3.out' }, 4.1)
        .fromTo('.ls-answer-ref', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6 }, 4.9)

      // 3. See it connect: the camera tips down to the board and ideas rise out of the page, joined by string.
      chapter(2, 6.2)
      step(2, 6.2)
      tl.to(world, { ...CAMERA.board, duration: 2.6, ease: 'power2.inOut' }, 5.9)
        .to('.ls-note', { z: 9, x: -400, y: 250, rotationX: 0, rotationZ: -8, duration: 1.6, ease: 'power2.inOut' }, 5.9)
        .to('.ls-answer', { z: 160, x: -160, y: -40, rotationZ: -10, autoAlpha: 0, duration: 0.8, ease: 'power2.in' }, 5.9)
        .to('.ls-doc-ink', { opacity: 0.35, duration: 1.2 }, 6.2)
      ideaCards.forEach((card, index) => {
        // Each idea starts as a small slip lying on the highlight it came from (re-measured on refresh, fonts move the lines).
        const source = el.querySelector<HTMLElement>(IDEAS[index].from)!
        // Highlights sit inside the paper; desk objects sit directly on the desk.
        const origin = () => source.closest('.ls-doc') ? { x: doc.offsetLeft + source.offsetLeft, y: doc.offsetTop + source.offsetTop } : { x: source.offsetLeft, y: source.offsetTop }
        tl.fromTo(card, {
          x: () => origin().x + source.offsetWidth / 2 - (card.offsetLeft + card.offsetWidth / 2),
          y: () => origin().y + source.offsetHeight / 2 - (card.offsetTop + card.offsetHeight / 2),
          z: -145, scale: 0.45, autoAlpha: 0, rotationZ: 0,
        }, { x: 0, y: 0, z: 0, scale: 1, autoAlpha: 1, rotationZ: [-3, 2.5, -1.5][index], duration: 1.3, ease: 'back.out(1.4)' }, 6.4 + index * 0.35)
      })
      tl.fromTo('.ls-hub', { z: -145, scale: 0.4, autoAlpha: 0 }, { z: 0, scale: 1, autoAlpha: 1, rotationZ: 1.5, duration: 1.1, ease: 'back.out(1.6)' }, 7.6)
        .fromTo(strings, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, stagger: 0.18, ease: 'power1.inOut' }, 8.1)
        .to(world, { rotationZ: CAMERA.board.rotationZ + 4, duration: 1.4 }, 8.6)
        .to('.ls-rail i', { scaleX: 1, duration: 10, ease: 'none' }, 0)

      // Use cases are dealt onto the desk one by one.
      gsap.from(q('.ls-use-slot'), {
        y: 70, rotationZ: (index: number) => [-4, 3, -2][index], autoAlpha: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out',
        scrollTrigger: { trigger: '.ls-use-grid', start: 'top 80%', once: true },
      })
      gsap.from('.ls-uses h2', {
        y: 24, autoAlpha: 0, duration: 0.7, ease: 'power2.out',
        scrollTrigger: { trigger: '.ls-uses', start: 'top 75%', once: true },
      })

      // The account form drops onto the desk once the story has played.
      gsap.from('.ls-join-card', {
        y: 90, rotationX: -24, rotationZ: -5, autoAlpha: 0, duration: 1.1, ease: 'power3.out', transformPerspective: 900,
        scrollTrigger: { trigger: '.ls-join', start: 'top 70%', once: true },
      })
      gsap.from('.ls-join-copy > *', {
        y: 24, autoAlpha: 0, duration: 0.7, stagger: 0.08, ease: 'power2.out',
        scrollTrigger: { trigger: '.ls-join', start: 'top 70%', once: true },
      })

      // One entrance on load: the header, the headline line by line, and the papers dealt onto the desk.
      gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.ls-header', { autoAlpha: 0, y: -12, duration: 0.6 })
        .from('.ls-hero-copy > *', { autoAlpha: 0, y: 30, duration: 0.8, stagger: 0.09 }, 0.1)
        .from('.ls-enter', { y: 120, rotationX: 20, duration: 1.4, ease: 'expo.out' }, 0.05)
        .from(q('.ls-media, .ls-sheet, .ls-doc'), { z: 240, autoAlpha: 0, duration: 0.9, stagger: 0.1 }, 0.25)
        .from('.ls-note', { autoAlpha: 0, duration: 0.5 }, 0.8)
        .from('.ls-pencil', { autoAlpha: 0, duration: 0.9 }, 0.6)
        .from(q('.ls-widget'), { z: 240, autoAlpha: 0, duration: 0.9, stagger: 0.15 }, 0.5)
        .to(filling, { value: HERO_WIDGETS.length, duration: 2.4, ease: 'none', onUpdate: () => setFill(filling.value) }, 1)

      document.fonts?.ready.then(() => ScrollTrigger.refresh())

      return () => {
        el.classList.remove('is-scrolly')
        gsap.ticker.remove(tick)
        gsap.ticker.lagSmoothing(500, 33)
        lenis.destroy()
        lenisRef.current = null
      }
    })
    return () => { motion.revert(); resize.disconnect() }
  }, [])

  function goToJoin(event?: { preventDefault: () => void }) {
    event?.preventDefault()
    const target = root.current?.querySelector<HTMLElement>('#join')
    if (!target) return
    if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 1.6 })
    else target.scrollIntoView()
  }

  return (
    <main className="auth-desk ls" id="top" ref={root}>
      <section className="ls-pin" aria-labelledby="landing-title">
        <header className="ls-header">
          <a className="auth-brand" href="#top"><LogoMark size={34} /><h1>Litter-ally</h1></a>
          <button type="button" className="ls-signin" onClick={() => { onSignIn(); goToJoin() }}>Sign in</button>
        </header>

        <div className="ls-copy">
          <div className="ls-hero-copy">
            <h2 id="landing-title">Every source. One clear picture.</h2>
            <p className="ls-lede">Drop in any source and a team of AI agents works together to turn it into one knowledge graph you can learn from.</p>
            <Button asChild size="lg" className="ls-start"><a href="#join" onClick={goToJoin}>Start with your sources</a></Button>
          </div>

          <ol className="ls-chapters">
            {CHAPTERS.map((chapter, index) => (
              <li className="ls-chapter" key={chapter.title}>
                <span className="ls-chapter-number">0{index + 1}</span>
                <h3>{chapter.title}</h3>
                <p>{chapter.body}</p>
              </li>
            ))}
          </ol>

          <div className="ls-steps" aria-hidden="true">
            <div className="ls-rail"><i /></div>
            {CHAPTERS.map(chapter => <span className="ls-step" key={chapter.title}>{chapter.step}</span>)}
          </div>
        </div>

        <div className="ls-stage" aria-hidden="true">
          <div className="ls-fit">
            <div className="ls-enter">
              <div className="ls-world">
                <div className="ls-mat" />
                <div className="ls-pencil"><i /></div>
                <div className="ls-sheet ls-sheet-3" />
                <div className="ls-sheet ls-sheet-2" />
                <article className="ls-doc">
                  <div className="ls-doc-ink">
                    <p className="ls-doc-meta">Ecology Review · Vol. 12</p>
                    <h4>The hidden life of forests</h4>
                    <p className="ls-doc-byline">A field study of shared roots</p>
                    <p>Beneath the forest floor, <mark>fungal threads wrap the roots</mark> of neighbouring trees and join them into one network.</p>
                    <p>Through these links, <mark>trees pass sugar and nitrogen</mark> to one another, often from sunlit giants to the shade.</p>
                    <p>In one stand of fir, <mark>older trees fed nearby seedlings</mark> until the young ones reached the light.</p>
                    <div className="ls-doc-lines"><i /><i /><i /><i /></div>
                    <span className="ls-doc-page">p. 4</span>
                  </div>
                </article>
                {HERO_WIDGETS.map((widget, index) => (
                  <div className="ls-widget" key={widget.id} style={{ left: widget.x, top: widget.y, rotate: `${widget.tilt}deg` }}>
                    <WidgetCard data={widget.data} w={widget.w} h={widget.h} shown={Math.max(0, Math.min(1, fill - index))} seed={`hero-${widget.id}`} />
                  </div>
                ))}
                <div className="ls-note"><Paper stock="sticky-yellow" seed="hero-question" size={[168, 150]} className="ls-note-paper"><span>?</span>How can one tree help another?</Paper></div>
                <div className="ls-answer">
                  <span className="ls-answer-label"><i>Diagnostic</i><i>Planner</i><b>Tutor</b></span>
                  <p>Through the fungal network. Roots trade sugar and nitrogen across it, so a tall tree can feed a seedling in its shade.</p>
                  <svg className="ls-answer-mark" viewBox="0 0 80 24"><path className="ls-answer-ref" pathLength={1} d="M4 18 C 20 6, 50 4, 76 12" /></svg>
                  <span className="ls-answer-cite">from p. 4, lines 3–9</span>
                </div>
                <div className="ls-board">
                  <svg className="ls-string" viewBox="0 0 640 520">
                    {STRINGS.map(d => <path key={d} d={d} pathLength={1} />)}
                  </svg>
                  {IDEAS.map(idea => (
                    <div className="ls-idea" key={idea.id} style={{ left: idea.x, top: idea.y, width: idea.w }}>
                      <b className="ls-pin-head" />{idea.label}
                    </div>
                  ))}
                  <div className="ls-idea ls-hub" style={{ left: HUB.x, top: HUB.y, width: HUB.w }}>
                    <b className="ls-pin-head" />
                    <small>The big idea</small>
                    A forest works like one connected organism
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="ls-cue" aria-hidden="true"><i />Scroll</p>
      </section>

      <section className="ls-uses" aria-labelledby="uses-title">
        <h2 id="uses-title">Tutor, research desk, or crash course.</h2>
        <div className="ls-use-grid">
          {USES.map((use, index) => (
            <div className="ls-use-slot" key={use.title}>
              <article className="ls-use">
                <b className="ls-pin-head" />
                <svg className="ls-use-art" viewBox="0 0 120 64" aria-hidden="true">{use.art}</svg>
                <span className="ls-chapter-number">0{index + 1}</span>
                <h3>{use.title}</h3>
                <p>{use.body}</p>
              </article>
            </div>
          ))}
        </div>
      </section>

      <section className="ls-join" id="join">
        <div className="ls-join-copy">
          <h2>Bring what you’re learning from.</h2>
          <p className="ls-lede">Make an account, add your sources, and let the agents do the first pass.</p>
        </div>
        <div className="ls-join-card">{children}</div>
      </section>

    </main>
  )
}
