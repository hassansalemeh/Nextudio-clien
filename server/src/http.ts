import type express from 'express'
import type { PoolClient } from 'pg'
import { pool } from './db'

// An error that should be returned to the client with this status and message
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
  }
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

export const roundMoney = (amount: number) => Math.round(amount * 100) / 100

// Sends an HttpError as-is; anything else is a 500 with a generic message. `uniqueMessage` maps a unique violation to a 400.
export function sendError(res: express.Response, err: unknown, fallback: string, uniqueMessage?: string) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  if (uniqueMessage && (err as { code?: string }).code === '23505') {
    return res.status(400).json({ error: uniqueMessage })
  }
  console.error(fallback, err)
  res.status(500).json({ error: fallback })
}

// A safe, one-paragraph description of an error for the server log: its type, code, message and the first few
// places in our code it passed through. Anything that looks like a secret is replaced by ***: the database URL and
// its password, any postgres:// address, session cookies and bearer tokens. Never log a raw request or the environment.
export function describeError(err: unknown): string {
  const e = err as { name?: string; code?: string; message?: string; stack?: string } | null
  let text = `${e?.name ?? 'Error'}${e?.code ? ` [${e.code}]` : ''}: ${e?.message ?? String(err)}`
  const stackLines = (e?.stack ?? '').split('\n').slice(1, 4).map((line) => line.trim())
  if (stackLines.length) text += ` | ${stackLines.join(' | ')}`

  const secrets: string[] = []
  const url = process.env.DATABASE_URL
  if (url) {
    secrets.push(url)
    try {
      const password = decodeURIComponent(new URL(url).password)
      if (password.length >= 3) secrets.push(password, encodeURIComponent(password))
    } catch {
      // not a parsable URL: the whole value is already redacted above
    }
  }
  for (const secret of secrets) text = text.split(secret).join('***')
  return text
    .replace(/postgres(ql)?:\/\/\S+/gi, 'postgres://***')
    .replace(/nx_session=[^;\s]+/gi, 'nx_session=***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
}
