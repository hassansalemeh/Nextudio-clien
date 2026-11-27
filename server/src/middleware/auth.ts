import type { Express, NextFunction, Request, Response } from 'express'
import type { AuthUser } from '../modules/auth/auth.service'
import { loadUser, sessionToken } from '../modules/auth/auth.service'
import { Role } from '../shared'
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

// Each route declares which roles may call it by putting allow(...) in its own middleware chain, e.g.
// app.get('/api/clients', allow(Role.Admin), handler). The role list is also stamped onto the returned
// function as `allowedRoles`, which is how assertEveryApiRouteDeclaresRoles (below) can tell, at startup,
// whether a given route actually has one of these in its chain.
export function allow(...roles: Role[]) {
  function middleware(req: Request, res: Response, next: NextFunction) {
    if (req.user && roles.includes(req.user.role)) return next()
    res.status(403).json({ error: 'You do not have access to this' })
  }
  middleware.allowedRoles = roles
  return middleware
}

type ApiRouteInfo = { method: string; path: string; allowedRoles: Role[] | null }

// Walks Express's internal route table to list every /api route actually registered on the app, and
// whether it carries an allow(...) check. Used both by assertEveryApiRouteDeclaresRoles below and by the
// role tests in server/tools/test-harness, so the list of routes to test is never hand-maintained.
export function listApiRoutes(app: Express): ApiRouteInfo[] {
  const stack = (app as unknown as { _router: { stack: ExpressLayer[] } })._router.stack
  const routes: ApiRouteInfo[] = []
  for (const layer of stack) {
    const route = layer.route
    if (!route || typeof route.path !== 'string' || !route.path.startsWith('/api')) continue
    const allowLayer = route.stack.find((s) => (s.handle as { allowedRoles?: Role[] }).allowedRoles !== undefined)
    const allowedRoles = (allowLayer?.handle as { allowedRoles?: Role[] } | undefined)?.allowedRoles ?? null
    for (const method of Object.keys(route.methods)) {
      if (route.methods[method]) routes.push({ method: method.toUpperCase(), path: route.path, allowedRoles })
    }
  }
  return routes
}

type ExpressLayer = {
  route?: { path: unknown; methods: Record<string, boolean>; stack: Array<{ handle: unknown }> }
}

// Deny by default: a route that someone forgets to mark with allow(...) must never become reachable just
// because they forgot. Rather than trust that a reviewer will always notice a missing role check, the
// server refuses to start at all if any /api route (other than the two that stay public, health and login)
// has no allow(...) in its chain - a missing check fails loudly in development/CI instead of quietly
// shipping an unprotected route to production.
export function assertEveryApiRouteDeclaresRoles(app: Express) {
  const missing = listApiRoutes(app)
    .filter((r) => r.allowedRoles === null)
    .filter((r) => r.path !== '/api/health' && !(r.path === '/api/auth/login' && r.method === 'POST'))
    .map((r) => `${r.method} ${r.path}`)
  if (missing.length > 0) {
    throw new Error(`These routes have no allow(...) role check and would be reachable by any logged-in user: ${missing.join(', ')}`)
  }
}

// For routes shared by both roles: an employee is always pinned to their own employee id,
// whatever the client sent. Admins choose the employee.
export function resolveEmployeeId(req: Request, supplied: unknown): unknown {
  return req.user?.role === Role.Employee ? req.user.employeeId : supplied
}

// Same idea as resolveEmployeeId, but for organization_members.id - every member has one (an admin
// or owner included, unlike employeeId), so this covers routes an admin can also act on behalf of
// someone else in. An employee is always pinned to their own membership; an admin's supplied value
// (possibly absent) passes through unchanged - a route that wants "default to the admin themselves"
// applies that default itself, since not every such route wants the same default.
export function resolveMemberId(req: Request, supplied: unknown): unknown {
  return req.user?.role === Role.Employee ? req.user.memberId : supplied
}

// The company the current request works in (set by authenticate from the session).
// Every query that reads or writes company data must use this.
export function organizationIdOf(req: Request): string {
  return req.user!.organizationId
}