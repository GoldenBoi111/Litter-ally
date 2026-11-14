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
      <IndexCard seed="auth" className="auth-card max-w-none">
        <div className="auth-brand"><LogoMark size={40} /><h1>Litter-ally</h1></div>
        <p className="auth-lede">{registering ? 'Create an account to keep your sources and boards on this computer.' : 'Sign in to open your board.'}</p>
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
  return <App key={user.id} user={user} onSignOut={() => void signOut()} notice={notice} />
}
