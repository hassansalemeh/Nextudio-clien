import type { NextFunction, Request, Response } from 'express'

// One log line per API request (method, path without query string, status, time); server errors are marked
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const started = Date.now()
  res.on('finish', () => {
    const line = `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms`
    if (res.statusCode >= 500) console.error(`[error] ${line}`)
    else if (!req.originalUrl.startsWith('/api/health')) console.log(line)
  })
  next()
}
