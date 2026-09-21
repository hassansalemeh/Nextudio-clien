import crypto from 'crypto'
import type { Express, NextFunction, Request, Response } from 'express'
import { pool } from './db'
import { describeError } from './http'
import { RateLimiter, isProduction, tooMany } from './security'

export type AuthUser = {
  id: string
  email: string
  role: 'admin' | 'employee'
  employeeId: string | null
  employeeName: string | null
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const SESSION_DAYS = 7
const SESSION_COOKIE = 'nx_session'

// The session lives in an HttpOnly cookie: page scripts can't read it, it is only sent over HTTPS in production,
// and SameSite=Strict keeps other websites from using it.
const cookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
  sameSite: 'strict' as const,
  path: '/',
}

// Login throttling: at most 20 attempts per address and 5 failed attempts per email in 15 minutes
const loginByAddress = new RateLimiter(20, 15 * 60 * 1000)
const failedLoginsByEmail = new RateLimiter(5, 15 * 60 * 1000)

// ---- passwords (scrypt, no extra dependencies) ----

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}

// a real hash of a random password, only used to keep login timing the same for unknown emails
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'))

// ---- sessions ----

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  await pool.query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [hashToken(token), userId, String(SESSION_DAYS)]
  )
  return token
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

// The browser sends the session cookie; scripts and tools may send the same token as a Bearer header instead
function sessionToken(req: Request): string | null {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) return header.slice(7)
  return readCookie(req, SESSION_COOKIE)
}

async function loadUser(token: string): Promise<AuthUser | null> {
  const result = await pool.query(
    `SELECT app_users.id, app_users.email, app_users.role, app_users.employee_id,
            employees.full_name AS employee_name, employees.is_active
     FROM auth_sessions
     JOIN app_users ON app_users.id = auth_sessions.user_id
     LEFT JOIN employees ON employees.id = app_users.employee_id
     WHERE auth_sessions.token_hash = $1 AND auth_sessions.expires_at > now()`,
    [hashToken(token)]
  )
  const row = result.rows[0]
  if (!row) return null
  // Deactivated employees lose access immediately
  if (row.role === 'employee' && !row.is_active) return null
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
  }
}

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = sessionToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Not logged in' })
  }
  try {
    const user = await loadUser(token)
    if (!user) {
      return res.status(401).json({ error: 'Session expired, please log in again' })
    }
    req.user = user
    next()
  } catch {
    res.status(500).json({ error: 'Authentication failed' })
  }
}

// Deny by default: employees may only call the routes listed here. Everything else is admin-only.
const EMPLOYEE_ROUTES = new Set([
  'GET /work-assignments',
  'GET /time/status',
  'GET /time/day',
  'POST /time/clock-in',
  'POST /time/start',
  'POST /time/stop',
  'POST /time/manual',
  'POST /time/clock-out',
])

function enforceRole(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'admin') return next()
  if (req.user?.role === 'employee' && EMPLOYEE_ROUTES.has(`${req.method} ${req.path}`)) return next()
  res.status(403).json({ error: 'You do not have access to this' })
}

// For routes shared by both roles: an employee is always pinned to their own employee id,
// whatever the client sent. Admins choose the employee.
export function resolveEmployeeId(req: Request, supplied: unknown): unknown {
  return req.user?.role === 'employee' ? req.user.employeeId : supplied
}

// Registers /api/auth/* and then protects every other /api route. Call before defining other routes.
export function registerAuth(app: Express) {
  app.post('/api/auth/login', async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim() : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    // throttle guessing: per address, and per email address after repeated failures
    const emailKey = email.toLowerCase()
    const addressWait = loginByAddress.hit(req.ip ?? 'unknown')
    if (addressWait > 0) return tooMany(res, addressWait, 'Too many login attempts. Please try again later.')
    const lockedFor = failedLoginsByEmail.blockedFor(emailKey)
    if (lockedFor > 0) return tooMany(res, lockedFor, 'Too many failed logins for this account. Please try again later.')

    try {
      const result = await pool.query('SELECT id, password_hash FROM app_users WHERE lower(email) = lower($1)', [email])
      const row = result.rows[0]
      // verify against a dummy hash for unknown emails so the response time doesn't reveal whether the account exists
      const valid = verifyPassword(password, row ? row.password_hash : DUMMY_HASH)
      if (!row || !valid) {
        failedLoginsByEmail.fail(emailKey)
        console.warn(`[auth] failed login for ${emailKey} from ${req.ip}`)
        return res.status(401).json({ error: 'Invalid email or password' })
      }
      const token = await createSession(row.id)
      const user = await loadUser(token)
      if (!user) {
        return res.status(401).json({ error: 'This account is inactive' })
      }
      failedLoginsByEmail.reset(emailKey)
      res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 })
      res.json({ user })
    } catch (err) {
      // the visitor only sees a generic message; the real cause goes to the server log (with secrets removed)
      console.error('[auth] login failed with a server error:', describeError(err))
      res.status(500).json({ error: 'Login failed' })
    }
  })

  app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: req.user })
  })

  app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
      await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1', [hashToken(sessionToken(req)!)])
      res.clearCookie(SESSION_COOKIE, cookieOptions)
      res.json({ ok: true })
    } catch {
      res.status(500).json({ error: 'Logout failed' })
    }
  })

  app.use('/api', authenticate, enforceRole)
}
