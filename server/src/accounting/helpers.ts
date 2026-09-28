import type { Request } from 'express'
import { HttpError } from '../http'

export function requireParamId(req: Request, paramName: string, label = 'Record'): string {
  const id = req.params[paramName]
  if (!/^\d+$/.test(id)) throw new HttpError(404, `${label} not found`)
  return id
}

export function queryId(value: unknown): string | null {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : null
}

export function queryString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function requireBookId(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new HttpError(400, 'A book must be selected')
  return value
}

// A reversal is an accounting CORRECTION, not a genuine second cash event - so a fully corrected pair
// (the original transaction `t` and the transaction that reversed it) must contribute nothing to management
// summary totals (Dashboard Money In/Out and its breakdowns, Project/Payee totals), even though Journal and
// every history/statement view must keep showing both, in full, forever.
//
// This works safely (always excludes exactly one full pair, never a mismatched half) because reversing a
// reversal is forbidden (see postingService.ts's doReverse): a transaction is either an untouched original or
// a reversal of one, never both, so "is this transaction part of a corrected pair" is always a clean yes/no -
// a transaction is excluded if it IS a reversal (reversal_of_transaction_id is set) or if it HAS BEEN reversed
// (another transaction's reversal_of_transaction_id points at it). A genuine real-world refund must be entered
// as its own new, independent transaction (never via Reverse), so it is never excluded by this condition.
export const EXCLUDE_REVERSAL_PAIRS_SQL = `
  t.reversal_of_transaction_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM accounting_transactions r WHERE r.reversal_of_transaction_id = t.id)
`
