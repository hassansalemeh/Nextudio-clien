import type { Express, NextFunction, Request, Response } from 'express'

export const isProduction = process.env.NODE_ENV === 'production'

// ---- simple in-memory rate limiting (one server process; counters reset when it restarts) ----

type Bucket = { count: number; resetAt: number }

export class RateLimiter {
  private buckets = new Map<string, Bucket>()

  constructor(private max: number, private windowMs: number) {
    // forget expired counters so the map cannot grow forever
    setInterval(() => {
      const now = Date.now()
      for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key)
    }, 60000).unref()
  }

  // Counts one hit. Returns how many seconds to wait when over the limit, otherwise 0.
  hit(key: string): number {
    const now = Date.now()
    let bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs }
      this.buckets.set(key, bucket)
    }
    bucket.count++
    return bucket.count > this.max ? Math.ceil((bucket.resetAt - now) / 1000) : 0
  }

  // How long until `key` may try again, without counting a new hit
  blockedFor(key: string): number {
    const bucket = this.buckets.get(key)
    if (!bucket || bucket.resetAt <= Date.now()) return 0
    return bucket.count >= this.max ? Math.ceil((bucket.resetAt - Date.now()) / 1000) : 0
  }

  // Count a failure (used for failed logins)
  fail(key: string) {
    this.hit(key)
  }

  reset(key: string) {
    this.buckets.delete(key)
  }
}

export function tooMany(res: Response, seconds: number, message: string) {
  res.setHeader('Retry-After', String(seconds))
  return res.status(429).json({ error: message })
}

// A generous limit on the whole API, only to blunt abuse: 600 requests per minute per address
const apiLimiter = new RateLimiter(600, 60 * 1000)

function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const wait = apiLimiter.hit(req.ip ?? 'unknown')
  if (wait > 0) return tooMany(res, wait, 'Too many requests. Please slow down.')
  next()
}

// ---- security headers, HTTPS, same-origin protection ----

function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (isProduction) {
    // tell browsers to use HTTPS only for the next year
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
}

// Behind the host's reverse proxy the original protocol arrives in X-Forwarded-Proto. Redirect to HTTPS only when the
// proxy explicitly says the request was plain http (never when the header is missing, which would cause a redirect loop).
function forceHttps(req: Request, res: Response, next: NextFunction) {
  if (isProduction && process.env.FORCE_HTTPS !== 'false' && req.headers['x-forwarded-proto'] === 'http' && req.path !== '/api/health') {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)
  }
  next()
}

// Cookies are SameSite=Strict, and on top of that a state-changing request from another website is refused.
// Allowed origins: this host, the public URL (PUBLIC_URL) and anything listed in ALLOWED_ORIGINS.
function sameOriginOnly(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || process.env.ORIGIN_CHECK === 'off') return next()
  const origin = req.headers.origin
  if (!origin) return next() // not a browser cross-site request (e.g. a script or the app's own tools)

  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    return res.status(403).json({ error: 'Request blocked' })
  }
  // local development: the Vite dev site (another port on this machine) talks to the API through a proxy
  if (!isProduction && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(originHost)) return next()

  const allowed = new Set<string>()
  if (req.headers.host) allowed.add(String(req.headers.host))
  if (req.headers['x-forwarded-host']) allowed.add(String(req.headers['x-forwarded-host']).split(',')[0].trim())
  if (process.env.PUBLIC_URL) {
    try {
      allowed.add(new URL(process.env.PUBLIC_URL).host)
    } catch {
      // ignore an invalid PUBLIC_URL
    }
  }
  for (const extra of (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    try {
      allowed.add(new URL(extra).host)
    } catch {
      // ignore
    }
  }
  if (!allowed.has(originHost)) {
    console.warn(`[security] blocked ${req.method} ${req.path} from origin ${origin}`)
    return res.status(403).json({ error: 'Request blocked' })
  }
  next()
}

// Registers everything above. Call first, before the routes.
export function registerSecurity(app: Express) {
  app.disable('x-powered-by')
  // trust the first proxy so req.ip / req.protocol reflect the real visitor (needed for rate limiting)
  app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : isProduction ? 1 : false)
  app.use(securityHeaders)
  app.use(forceHttps)
  app.use('/api', apiRateLimit)
  app.use('/api', sameOriginOnly)
}
