import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import { promisify } from 'node:util'
import express from 'express'
import { readJson, withLock, writeJson } from './disk.mjs'

const scrypt = promisify(scryptCallback)
const COOKIE = 'la_session'
const SESSION_DAYS = 30
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_FAILURES = 8
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

const hashToken = token => createHash('sha256').update(token).digest('hex')

async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await scrypt(password, salt, 64)
  return { salt, hash: key.toString('hex') }
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return ''
}

const publicUser = user => ({ id: user.id, email: user.email, name: user.name })

/** Rejects state-changing requests sent from another site's page. SameSite=Lax cookies already block most of these; this closes the rest. */
export function rejectCrossSite(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || !req.headers.origin) return next()
  try {
    const origin = new URL(req.headers.origin)
    // The dev proxy rewrites Host to the API port, and the API only listens on loopback, so this machine's own pages are same-site.
    if (origin.host === req.headers.host || origin.host === req.headers['x-forwarded-host'] || LOOPBACK.has(origin.hostname)) return next()
  } catch {}
  res.status(403).json({ error: 'Requests from other sites are not allowed.' })
}

export async function createAuth({ dataDir }) {
  const usersPath = join(dataDir, 'users.json')
  const sessionsPath = join(dataDir, 'sessions.json')
  const sessions = new Map(Object.entries(await readJson(sessionsPath, {})))
  const failures = new Map()
  // Login for an unknown email still pays for one scrypt, so response time doesn't reveal which emails exist.
  const dummy = await hashPassword('litter-ally-timing-guard')

  const loadUsers = () => readJson(usersPath, [])
  const saveSessions = () => withLock('sessions', () => writeJson(sessionsPath, Object.fromEntries(sessions)))

  async function startSession(req, res, userId) {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = Date.now() + SESSION_DAYS * 864e5
    sessions.set(hashToken(token), { userId, expiresAt })
    await saveSessions()
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`)
  }

  function throttled(key) {
    const entry = failures.get(key)
    if (!entry || Date.now() - entry.since > FAILURE_WINDOW_MS) return false
    return entry.count >= MAX_FAILURES
  }
  function recordFailure(key) {
    const entry = failures.get(key)
    if (!entry || Date.now() - entry.since > FAILURE_WINDOW_MS) failures.set(key, { count: 1, since: Date.now() })
    else entry.count++
  }

  async function currentUser(req) {
    const token = readCookie(req, COOKIE)
    if (!token) return null
    const session = sessions.get(hashToken(token))
    if (!session || session.expiresAt < Date.now()) return null
    const user = (await loadUsers()).find(item => item.id === session.userId)
    return user ? publicUser(user) : null
  }

  const router = express.Router()
  router.use(express.json({ limit: '16kb' }))

  router.post('/register', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const name = String(req.body?.name || '').trim().slice(0, 80)
    const password = String(req.body?.password || '')
    if (!EMAIL.test(email) || email.length > 200) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (password.length < 8 || password.length > 200) return res.status(400).json({ error: 'Use a password between 8 and 200 characters.' })
    const created = await withLock('users', async () => {
      const users = await loadUsers()
      if (users.some(user => user.email === email)) return null
      const user = { id: randomUUID(), email, name: name || email.split('@')[0], ...(await hashPassword(password)), createdAt: new Date().toISOString() }
      await writeJson(usersPath, [...users, user])
      return user
    })
    if (!created) return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' })
    await startSession(req, res, created.id)
    res.status(201).json({ user: publicUser(created) })
  })

  router.post('/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const key = `${req.ip}:${email}`
    if (throttled(key)) return res.status(429).json({ error: 'Too many attempts. Wait 15 minutes and try again.' })
    const user = (await loadUsers()).find(item => item.email === email)
    const { hash } = await hashPassword(password, user?.salt || dummy.salt)
    const ok = user && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'))
    if (!ok) {
      recordFailure(key)
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }
    failures.delete(key)
    await startSession(req, res, user.id)
    res.json({ user: publicUser(user) })
  })

  router.post('/logout', async (req, res) => {
    const token = readCookie(req, COOKIE)
    if (token && sessions.delete(hashToken(token))) await saveSessions()
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
    res.json({ ok: true })
  })

  router.get('/me', async (req, res) => {
    const user = await currentUser(req)
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' })
    res.json({ user })
  })

  router.patch('/profile', async (req, res) => {
    const current = await currentUser(req)
    if (!current) return res.status(401).json({ error: 'Sign in to continue.' })
    const name = String(req.body?.name || '').trim().slice(0, 80)
    if (!name) return res.status(400).json({ error: 'Enter a name.' })
    const updated = await withLock('users', async () => {
      const users = await loadUsers()
      const index = users.findIndex(user => user.id === current.id)
      if (index < 0) return null
      users[index] = { ...users[index], name }
      await writeJson(usersPath, users)
      return publicUser(users[index])
    })
    if (!updated) return res.status(401).json({ error: 'Sign in to continue.' })
    res.json({ user: updated })
  })

  async function requireUser(req, res, next) {
    try {
      const user = await currentUser(req)
      if (!user) return res.status(401).json({ error: 'Sign in to continue.' })
      req.user = user
      next()
    } catch (error) {
      next(error)
    }
  }

  async function pruneSessions() {
    let removed = 0
    for (const [key, session] of sessions) if (session.expiresAt < Date.now()) { sessions.delete(key); removed++ }
    if (removed) await saveSessions()
    return removed
  }

  return { router, requireUser, pruneSessions }
}
