import type { NextFunction, Request, Response } from 'express'
import type { ZodType } from 'zod'

type Schemas = { body?: ZodType; params?: ZodType; query?: ZodType }

// Reports the first problem found, as one clear sentence - not an exhaustive list, since the client only
// acts on one message at a time and every field's schema below already carries its own specific wording.
// When the problem is inside an array of objects (e.g. an estimate's line items), the message is prefixed
// with which row it is - "Item 3: ..." - since the field's own message has no way to say that by itself.
function firstMessage(error: { issues: Array<{ message: string; path: PropertyKey[] }> }): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const arrayIndex = issue.path.findIndex((segment) => typeof segment === 'number')
  if (arrayIndex !== -1) return `Item ${(issue.path[arrayIndex] as number) + 1}: ${issue.message}`
  return issue.message
}

// Validates req.body / req.params / req.query against the given schemas and REPLACES each with the parsed,
// cleaned result (strings trimmed, unknown keys stripped, defaults applied) - so every handler downstream only
// ever sees data that already matches its schema, never the raw request. Responds 400 with a single
// human-readable message on the first problem found; never throws, so a bad request can't reach a 500.
export function validate({ body, params, query }: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (body) {
      const result = body.safeParse(req.body)
      if (!result.success) return res.status(400).json({ error: firstMessage(result.error) })
      req.body = result.data
    }
    if (params) {
      const result = params.safeParse(req.params)
      if (!result.success) return res.status(400).json({ error: firstMessage(result.error) })
      req.params = result.data as typeof req.params
    }
    if (query) {
      const result = query.safeParse(req.query)
      if (!result.success) return res.status(400).json({ error: firstMessage(result.error) })
      req.query = result.data as typeof req.query
    }
    next()
  }
}
