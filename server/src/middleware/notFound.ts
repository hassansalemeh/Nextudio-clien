import type { Request, Response } from 'express'

// unknown API addresses answer with JSON, never with the app's HTML
export function apiNotFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' })
}
