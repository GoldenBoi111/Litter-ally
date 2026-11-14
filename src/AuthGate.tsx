import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { IndexCard } from './components/ui/index-card'
import { Paper } from './components/ui/paper'
import { StickyNote } from './components/ui/sticky-note'
import { LogoMark } from './Logo'
import { SIGNED_OUT_EVENT, api, importBrowserLibrary } from './storage'
import App from './App'

gsap.registerPlugin(ScrollTrigger)

export type User = { id: string; email: string; name: string }
type Mode = 'sign-in' | 'register'

function AuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const landing = useRef<HTMLElement>(null)
  const [mode, setMode] = useState<Mode>('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const { user } = await api<{ user: User }>(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, {
        method: 'POST',
        json: { email: form.get('email'), password: form.get('password'), name: form.get('name') || undefined },
      })
      onSignedIn(user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sign in.')
      setBusy(false)
    }
  }

  const registering = mode === 'register'
  useLayoutEffect(() => {
    const lenis = new Lenis({ autoRaf: true, anchors: true })
    lenis.on('scroll', ScrollTrigger.update)
    const motion = gsap.matchMedia(landing.current!)
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const intro = gsap.timeline({ defaults: { ease: 'power2.out' } })
      intro.from('.landing-header', { autoAlpha: 0, y: -10, duration: 0.45 })
        .from('.landing-kicker', { autoAlpha: 0, y: 12, duration: 0.45 }, 0.12)
        .from('.landing-story h2', { autoAlpha: 0, y: 16, duration: 0.55 }, 0.2)
        .from('.landing-copy', { autoAlpha: 0, y: 12, duration: 0.45 }, 0.36)
        .from('.landing-example-caption', { autoAlpha: 0, y: 10, duration: 0.4 }, 0.48)
        .from('.landing-proof-source', { autoAlpha: 0, y: 18, rotation: -1.5, duration: 0.55 }, 0.55)
        .from('.landing-proof-tutor', { autoAlpha: 0, y: 18, rotation: 1.5, duration: 0.55 }, 0.7)
        .from('.landing-proof-map', { autoAlpha: 0, y: 16, scale: 0.97, duration: 0.55 }, 0.85)
        .from('.auth-card', { autoAlpha: 0, y: 18, duration: 0.6 }, 0.3)
        .from('.landing-footer', { autoAlpha: 0, duration: 0.35 }, 0.85)
      intro.fromTo('.landing-example-thread path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: 'power1.inOut' }, 0.8)
      gsap.to('.auth-card', {
        rotation: 0.4, transformOrigin: 'center', ease: 'none',
        scrollTrigger: { trigger: '.auth-card', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      })
      gsap.to('.landing-example', {
        y: -18, ease: 'none',
        scrollTrigger: { trigger: '.landing-example', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      })
    })
    return () => { motion.revert(); lenis.destroy() }
  }, [])
  useLayoutEffect(() => { ScrollTrigger.refresh() }, [registering])

  return (
    <main className="auth-desk" ref={landing}>
      <header className="landing-header"><a className="auth-brand" href="#home"><LogoMark size={36} /><h1>Litter-ally</h1></a><span>Read closely. Think clearly.</span></header>
      <div className="landing-layout" id="home">
        <section className="landing-story" aria-labelledby="landing-title">
          <p className="landing-kicker">A reading desk for curious minds</p>
          <h2 id="landing-title">Turn what you read<br />into what you know.</h2>
          <p className="landing-copy">Bring a source, ask what matters, and watch the ideas take shape.</p>
          <Button asChild size="sm" className="landing-start"><a href="#auth-form">Create your reading desk <span aria-hidden="true">↘</span></a></Button>
          <figure className="landing-example" aria-label="Example project: a source, a tutor exchange, and an idea map">
            <figcaption className="landing-example-caption"><span>SAMPLE PROJECT</span><b>One source. A clearer picture.</b></figcaption>
            <div className="landing-example-flow">
              <svg className="landing-example-thread" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <path pathLength="1" d="M31 50 C34 50 35 50 37 50 M63 50 C66 50 67 50 69 50" />
              </svg>
              <IndexCard as="article" seed="landing-source" className="landing-proof-card landing-proof-source">
                <span className="landing-proof-label">SOURCE · RESEARCH PAPER</span>
                <h3>The hidden life of forests</h3>
                <p>How fungi move nutrients between trees</p>
                <small>12 pages · added to your library</small>
              </IndexCard>
              <StickyNote as="article" seed="landing-tutor" color="green" className="landing-proof-card landing-proof-tutor">
                <span className="landing-proof-label">A QUESTION, GROUNDED IN THE SOURCE</span>
                <h3>How can one tree help another?</h3>
                <p>Fungal networks connect roots and can move nutrients across a forest.</p>
              </StickyNote>
              <Paper as="article" seed="landing-map" stock="paper" rules="ruled" className="landing-proof-card landing-proof-map">
                <span className="landing-proof-label">IDEA MAP</span>
                <div className="landing-map" role="img" aria-label="Fungi connect tree roots, nutrients, sharing, and forest health">
                  <svg viewBox="0 0 180 90" aria-hidden="true"><path d="M90 45 35 20M90 45 145 20M90 45 35 70M90 45 145 70" /></svg>
                  <span className="map-root">fungi</span><span className="map-top-left">tree roots</span><span className="map-top-right">nutrients</span><span className="map-bottom-left">sharing</span><span className="map-bottom-right">forest health</span>
                </div>
              </Paper>
            </div>
          </figure>
        </section>
        <IndexCard id="auth-form" seed="auth" className="auth-card max-w-none">
          <p className="landing-form-kicker">{registering ? 'START WITH YOUR OWN SOURCES' : 'WELCOME BACK'}</p>
          <h2 className="landing-form-title">{registering ? 'Create your account' : 'Sign in'}</h2>
          <p className="auth-lede">{registering ? 'Make a reading desk that stays yours.' : 'Your desk is ready when you are.'}</p>
          <form onSubmit={submit} className="auth-form">
            {registering && <label>Name<Input name="name" autoComplete="name" maxLength={80} /></label>}
            <label>Email<Input name="email" type="email" autoComplete="email" required /></label>
            <label>Password<Input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} minLength={registering ? 8 : undefined} required /></label>
            {registering && <p className="auth-hint">At least 8 characters.</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button type="submit" disabled={busy}>{busy ? (registering ? 'Creating account…' : 'Signing in…') : registering ? 'Create account' : 'Sign in'}</Button>
          </form>
          <p className="auth-switch">
            {registering ? 'Already have an account?' : 'New here?'}{' '}
            <button type="button" onClick={() => { setMode(registering ? 'sign-in' : 'register'); setError('') }}>{registering ? 'Sign in' : 'Create an account'}</button>
          </p>
        </IndexCard>
      </div>
      <footer className="landing-footer">A calmer way to read, learn, and make connections.</footer>
    </main>
  )
}

/** Shows sign-in until the server confirms a session, then the app. Sources saved in this browser before accounts existed move into a new, empty account. */
export function AuthGate() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api<{ user: User }>('/api/auth/me').then(({ user }) => setUser(user), () => setUser(null))
    const signedOut = () => setUser(null)
    window.addEventListener(SIGNED_OUT_EVENT, signedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, signedOut)
  }, [])

  async function signedIn(next: User) {
    try {
      const moved = await importBrowserLibrary()
      if (moved) setNotice(`Moved ${moved} ${moved === 1 ? 'source' : 'sources'} from this browser into your account.`)
    } catch {
      setNotice('Some sources saved in this browser could not be moved. They are still in the browser; sign out and back in to retry.')
    }
    setUser(next)
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  if (user === undefined) return <main className="auth-desk" aria-busy="true" />
  if (!user) return <AuthScreen onSignedIn={next => void signedIn(next)} />
  return <App key={user.id} user={user} onUserUpdated={setUser} onSignOut={() => void signOut()} notice={notice} />
}
