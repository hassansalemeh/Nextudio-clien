import type { NextFunction, Request, Response } from 'express'
import type { AuthUser } from '../modules/auth/auth.service'
import { loadUser, sessionToken } from '../modules/auth/auth.service'

declare global {
   // eslint-disable-next-line @typescript-eslint/no-namespace -- standard way to add req.user to Express
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
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
  'GET /projects/active-names',
  'GET /time/status',
  'GET /time/day',
  'POST /time/clock-in',
  'POST /time/start',
  'POST /time/stop',
  'POST /time/manual',
  'POST /time/clock-out',
])

export function enforceRole(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'admin') return next()
  if (req.user?.role === 'employee' && EMPLOYEE_ROUTES.has(`${req.method} ${req.path}`)) return next()
  res.status(403).json({ error: 'You do not have access to this' })
}

// For routes shared by both roles: an employee is always pinned to their own employee id,
// whatever the client sent. Admins choose the employee.
export function resolveEmployeeId(req: Request, supplied: unknown): unknown {
  return req.user?.role === 'employee' ? req.user.employeeId : supplied
}

// The company the current request works in (set by authenticate from the session).
// Every query that reads or writes company data must use this.
export function organizationIdOf(req: Request): string {
  return req.user!.organizationId
}