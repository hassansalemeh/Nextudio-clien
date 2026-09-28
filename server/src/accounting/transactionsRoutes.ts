import type { Express, Request } from 'express'
import { pool } from '../db'
import { HttpError, sendError } from '../http'
import { EXCLUDE_REVERSAL_PAIRS_SQL, requireBookId, requireParamId, queryId, queryString } from './helpers'
import { parsePostTransactionInput, postTransaction, reverseTransaction } from './postingService'

// reversed_by_transaction_id is derived, not stored: a transaction's own status stays 'posted' forever even
// after it is reversed (see the schema migration's comment on accounting_transactions), so "has this been
// reversed" is answered by whether another transaction exists pointing back at it via reversal_of_transaction_id.
const TRANSACTION_SELECT = `
  SELECT t.id, t.book_id, t.direction, t.status, t.transaction_date, t.description, t.amount, t.currency_code,
         t.exchange_rate, t.reference, t.reversal_of_transaction_id, t.journal_entry_id, t.created_at,
         t.project_id, projects.name AS project_name,
         t.counterparty_id, cp.name AS counterparty_name,
         t.category_account_id, aa.name AS category_name,
         t.from_cash_account_id, fca.name AS from_cash_account_name,
         t.to_cash_account_id, tca.name AS to_cash_account_name,
         je.reference AS journal_reference,
         (SELECT r.id FROM accounting_transactions r WHERE r.reversal_of_transaction_id = t.id) AS reversed_by_transaction_id
  FROM accounting_transactions t
  LEFT JOIN projects ON projects.id = t.project_id
  LEFT JOIN accounting_counterparties cp ON cp.id = t.counterparty_id
  LEFT JOIN accounting_accounts aa ON aa.id = t.category_account_id
  LEFT JOIN accounting_cash_accounts fca ON fca.id = t.from_cash_account_id
  LEFT JOIN accounting_cash_accounts tca ON tca.id = t.to_cash_account_id
  LEFT JOIN accounting_journal_entries je ON je.id = t.journal_entry_id`

function requireTransactionId(req: Request) {
  return requireParamId(req, 'transactionId', 'Transaction')
}

export function registerAccountingTransactionRoutes(app: Express) {
  app.get('/api/accounting/transactions', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const conditions = ['t.book_id = $1']
      const params: unknown[] = [bookId]

      const projectId = queryId(req.query.project_id)
      if (projectId) { params.push(projectId); conditions.push(`t.project_id = $${params.length}`) }
      const counterpartyId = queryId(req.query.counterparty_id)
      if (counterpartyId) { params.push(counterpartyId); conditions.push(`t.counterparty_id = $${params.length}`) }
      const cashAccountId = queryId(req.query.cash_account_id)
      if (cashAccountId) {
        params.push(cashAccountId)
        conditions.push(`(t.from_cash_account_id = $${params.length} OR t.to_cash_account_id = $${params.length})`)
      }
      const categoryAccountId = queryId(req.query.category_account_id)
      if (categoryAccountId) { params.push(categoryAccountId); conditions.push(`t.category_account_id = $${params.length}`) }
      const direction = queryString(req.query.direction)
      if (direction) { params.push(direction); conditions.push(`t.direction = $${params.length}`) }
      const dateFrom = queryString(req.query.date_from)
      if (dateFrom) { params.push(dateFrom); conditions.push(`t.transaction_date >= $${params.length}`) }
      const dateTo = queryString(req.query.date_to)
      if (dateTo) { params.push(dateTo); conditions.push(`t.transaction_date <= $${params.length}`) }

      // This list backs the Dashboard's drill-down (Money In/Out -> this list -> a transaction), so by
      // default it excludes fully reversed pairs, the same way the totals it drills from do (see
      // EXCLUDE_REVERSAL_PAIRS_SQL) - otherwise a drilled list could show a transaction that isn't actually
      // part of the total the admin clicked. Pass include_reversed_pairs=true to see everything (e.g. a
      // future audit-style listing), same as Journal and the history views already do.
      if (queryString(req.query.include_reversed_pairs) !== 'true') conditions.push(EXCLUDE_REVERSAL_PAIRS_SQL)

      const result = await pool.query(
        `${TRANSACTION_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY t.transaction_date DESC, t.id DESC LIMIT 500`,
        params
      )
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch transactions')
    }
  })

  app.get('/api/accounting/transactions/:transactionId', async (req, res) => {
    try {
      const id = requireTransactionId(req)
      const result = await pool.query(`${TRANSACTION_SELECT} WHERE t.id = $1`, [id])
      if (result.rows.length === 0) throw new HttpError(404, 'Transaction not found')
      res.json(result.rows[0])
    } catch (err) {
      sendError(res, err, 'Failed to fetch transaction')
    }
  })

  // Posts immediately: the Add Transaction page's own Review/Confirm step is what protects against an
  // accidental submit, not a second server-side approval stage.
  app.post('/api/accounting/transactions', async (req, res) => {
    try {
      const userId = req.user!.id
      const input = parsePostTransactionInput(req.body, userId)
      const posted = await postTransaction(input)
      const result = await pool.query(`${TRANSACTION_SELECT} WHERE t.id = $1`, [posted.transactionId])
      res.status(201).json(result.rows[0])
    } catch (err) {
      sendError(res, err, 'Failed to post the transaction')
    }
  })

  app.post('/api/accounting/transactions/:transactionId/reverse', async (req, res) => {
    try {
      const id = requireTransactionId(req)
      const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : null
      const userId = req.user!.id
      await reverseTransaction(id, userId, reason)
      const result = await pool.query(`${TRANSACTION_SELECT} WHERE t.id = $1`, [id])
      res.json(result.rows[0])
    } catch (err) {
      sendError(res, err, 'Failed to reverse the transaction')
    }
  })
}
