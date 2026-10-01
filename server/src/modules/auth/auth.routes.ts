import type { Express } from 'express'
import { authenticate } from '../../middleware/auth'
import { tooMany } from '../../middleware/security'
import { describeError } from '../../shared'
import * as authRepository from './auth.repository'
import {
  cookieOptions,
  createSession,
  DUMMY_HASH,
  failedLoginsByEmail,
  hashToken,
  loadUser,
  loginByAddress,
  sessionToken,
  SESSION_COOKIE,
  SESSION_DAYS,
  verifyPassword,
} from './auth.service'

// Registers /api/auth/* only. The global authenticate + enforceRole gate for every other /api route is
// applied directly in app.ts, right after this call, so the registration order stays exactly as before.
export function registerAuthRoutes(app: Express) {
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
      const row = await authRepository.selectUserByEmail(email)
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
      await authRepository.deleteSession(hashToken(sessionToken(req)!))
      res.clearCookie(SESSION_COOKIE, cookieOptions)
      res.json({ ok: true })
    } catch {
      res.status(500).json({ error: 'Logout failed' })
    }
  })
}
