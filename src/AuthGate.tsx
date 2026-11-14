import { useEffect, useState, type FormEvent } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { IndexCard } from './components/ui/index-card'
import { LogoMark } from './Logo'
import { SIGNED_OUT_EVENT, api, importBrowserLibrary } from './storage'
import App from './App'

export type User = { id: string; email: string; name: string }
type Mode = 'sign-in' | 'register'

function AuthScreen({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>('sign-in')
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
  return (
    <main className="auth-desk">
      <header className="landing-header"><a className="auth-brand" href="#home"><LogoMark size={36} /><h1>Litter-ally</h1></a><span>Read closely. Think clearly.</span></header>
      <div className="landing-layout" id="home">
        <section className="landing-story" aria-labelledby="landing-title">
          <p className="landing-kicker">A reading desk for curious minds</p>
          <h2 id="landing-title">Turn what you read<br />into what you know.</h2>
          <p className="landing-copy">Bring your sources together, ask better questions, and build a clear picture of the ideas that matter.</p>
          <div className="landing-steps" aria-label="How Litter-ally works">
            <div><span>01</span><b>Gather</b><p>Start with a paper, link, file, or a question.</p></div>
            <div><span>02</span><b>Explore</b><p>Learn with a tutor grounded in your sources.</p></div>
            <div><span>03</span><b>Connect</b><p>Map ideas on a canvas you can keep building.</p></div>
          </div>
          <p className="landing-note">Your library and boards stay with your account.</p>
        </section>
        <IndexCard seed="auth" className="auth-card max-w-none">
          <p className="landing-form-kicker">{registering ? 'Make a little room to learn' : 'Welcome back'}</p>
          <h2 className="landing-form-title">{registering ? 'Create your account' : 'Sign in'}</h2>
          <p className="auth-lede">{registering ? 'Save your sources and pick up where you left off.' : 'Your desk is ready when you are.'}</p>
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
