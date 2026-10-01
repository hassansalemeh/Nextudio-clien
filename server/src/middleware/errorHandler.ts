import type { NextFunction, Request, Response } from 'express'

// Last resort: log the details on the server, tell the visitor only that something went wrong (never a stack trace)
export function errorHandler(err: Error & { status?: number; type?: string }, req: Request, res: Response, _next: NextFunction) {
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500
  console.error(`[error] ${req.method} ${req.path}:`, status === 500 ? err : err.message)
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : 'Invalid request' })
}
