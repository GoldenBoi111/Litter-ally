import { useState, type FormEvent } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { api } from './storage'
import type { User } from './AuthGate'

export function AccountSettings({ user, onUserUpdated, onSignOut, onClose }: {
  user: User
  onUserUpdated: (user: User) => void
  onSignOut: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(user.name)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const { user: updated } = await api<{ user: User }>('/api/auth/profile', { method: 'PATCH', json: { name } })
      onUserUpdated(updated)
      setName(updated.name)
      setMessage('Your name has been saved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your account details.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
        <header className="account-dialog-header">
          <div><p className="account-eyebrow">Your desk</p><h2 id="account-title">Account settings</h2></div>
          <button type="button" className="dialog-close" aria-label="Close account settings" onClick={onClose}>×</button>
        </header>
        <p className="account-intro">Manage the details connected to your Litter-ally account.</p>
        <form className="account-form" onSubmit={save}>
          <label>Display name<Input name="name" autoComplete="name" maxLength={80} required value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Email address<Input value={user.email} readOnly aria-describedby="account-email-note" /></label>
          <p id="account-email-note" className="account-help">Your email is used to sign in and can’t be changed here.</p>
          {message && <p className="account-success" role="status">{message}</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <div className="account-actions"><Button type="submit" disabled={busy || !name.trim() || name.trim() === user.name}>{busy ? 'Saving…' : 'Save changes'}</Button><Button type="button" variant="outline" onClick={onClose}>Done</Button></div>
        </form>
        <section className="account-session"><div><b>Signed in</b><p>Sign out of this account on this device.</p></div><Button type="button" variant="outline" onClick={onSignOut}>Sign out</Button></section>
      </section>
    </div>
  )
}
