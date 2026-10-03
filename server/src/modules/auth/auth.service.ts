import crypto from 'crypto'
import type { Request } from 'express'
import { isProduction, RateLimiter } from '../../middleware/security'
import * as authRepository from './auth.repository'

export type AuthUser = {
  id: string
  email: string
  role: 'admin' | 'employee'
  employeeId: string | null
  employeeName: string | null
}

export const SESSION_DAYS = 7
export const SESSION_COOKIE = 'nx_session'

// The session lives in an HttpOnly cookie: page scripts can't read it, it is only sent over HTTPS in production,
// and SameSite=Strict keeps other websites from using it.
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
  sameSite: 'strict' as const,
  path: '/',
}

// Login throttling: at most 20 attempts per address and 5 failed attempts per email in 15 minutes
export const loginByAddress = new RateLimiter(20, 15 * 60 * 1000)
export const failedLoginsByEmail = new RateLimiter(5, 15 * 60 * 1000)

// ---- passwords (scrypt, no extra dependencies) ----

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(actual, expected)
}

// a real hash of a random password, only used to keep login timing the same for unknown emails
export const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'))

// ---- sessions ----

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string, organizationId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  await authRepository.insertSession(hashToken(token), userId, organizationId, SESSION_DAYS)
  return token
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return null
}

// The browser sends the session cookie; scripts and tools may send the same token as a Bearer header instead
export function sessionToken(req: Request): string | null {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) return header.slice(7)
  return readCookie(req, SESSION_COOKIE)
}

export async function loadUser(token: string): Promise<AuthUser | null> {
  const row = await authRepository.selectUserBySession(hashToken(token))
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
