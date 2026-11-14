import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { IndexCard } from './components/ui/index-card'
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
    const lenis = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? null
      : new Lenis({ autoRaf: true, anchors: true })
    lenis?.on('scroll', ScrollTrigger.update)
    const motion = gsap.matchMedia(landing.current!)
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const intro = gsap.timeline({ defaults: { ease: 'power2.out' } })
      intro.from('.landing-header', { autoAlpha: 0, y: -10, duration: 0.45 })
        .from('.landing-kicker', { autoAlpha: 0, y: 12, duration: 0.45 }, 0.12)
        .from('.landing-story h2', { autoAlpha: 0, y: 22, duration: 0.65 }, 0.2)
        .from('.landing-copy, .landing-actions', { autoAlpha: 0, y: 14, duration: 0.5, stagger: 0.08 }, 0.4)
        .from('.landing-scene', { autoAlpha: 0, y: 28, rotateX: 7, scale: 0.96, duration: 0.9, transformOrigin: '50% 65%' }, 0.32)
        .from('.landing-scene-callout', { autoAlpha: 0, y: 12, duration: 0.5, stagger: 0.1 }, 0.8)
        .from('.auth-card', { autoAlpha: 0, y: 18, duration: 0.6 }, 0.3)
        .from('.landing-footer', { autoAlpha: 0, duration: 0.35 }, 0.85)
      intro.fromTo('.landing-map-trace', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power1.inOut' }, 0.9)
      gsap.to('.auth-card', {
        y: -18, rotate: -1, transformOrigin: 'center', ease: 'none',
        scrollTrigger: { trigger: '.auth-card', start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      })
      gsap.to('.landing-scene-art', {
        yPercent: 7, rotate: -3, scale: 1.04, ease: 'none',
        scrollTrigger: { trigger: '.landing-scene', start: 'top bottom', end: 'bottom top', scrub: 1 },
      })
    })
    return () => { motion.revert(); lenis?.destroy() }
  }, [])
  useLayoutEffect(() => { ScrollTrigger.refresh() }, [registering])

  return (
    <main className="auth-desk" ref={landing}>
      <header className="landing-header"><a className="auth-brand" href="#home"><LogoMark size={36} /><h1>Litter-ally</h1></a><span>Read closely. Think clearly.</span></header>
      <div className="landing-layout" id="home">
        <section className="landing-story" aria-labelledby="landing-title">
          <p className="landing-kicker">A reading desk for curious minds</p>
          <h2 id="landing-title">Turn what you read<br />into what you know.</h2>
          <p className="landing-copy">Bring a source. Ask a better question. Leave with ideas connected.</p>
          <div className="landing-actions">
            <Button asChild size="sm" className="landing-start"><a href="#auth-form">Start with your sources <span aria-hidden="true">?</span></a></Button>
            <a className="landing-see" href="#sample">See what you can make <span aria-hidden="true">?</span></a>
          </div>
          <figure className="landing-scene" id="sample" aria-label="Sample learning outcome: forest research becomes connected ideas">
            <img className="landing-scene-art" src="/images/reading-desk-hero.png" alt="A three-dimensional open sage-green notebook with embossed connected idea paths" />
            <figcaption className="landing-scene-caption"><span>ONE SOURCE, UNDERSTOOD</span><b>How forests share what they need</b></figcaption>
            <div className="landing-scene-callout landing-source-callout"><span>THE SOURCE</span><b>Wood wide web</b><small>Forest ecology ? research notes</small></div>
            <div className="landing-scene-callout landing-tutor-callout"><span>THE INSIGHT</span><b>Roots trade resources through fungal networks.</b></div>
            <div className="landing-scene-callout landing-map-callout" role="img" aria-label="Concept map connecting fungi, tree roots, nutrients and forest health">
              <span>THE CONNECTIONS</span><div className="landing-mini-map"><svg viewBox="0 0 100 72" aria-hidden="true"><path className="landing-map-trace" pathLength="1" d="M50 36 19 15M50 36 81 15M50 36 19 57M50 36 81 57" /></svg><b className="landing-map-center">fungi</b><i className="landing-node node-a">roots</i><i className="landing-node node-b">nutrients</i><i className="landing-node node-c">sharing</i><i className="landing-node node-d">forest</i></div>
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
