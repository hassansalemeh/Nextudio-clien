import type { Express, Request } from 'express'
import { pool } from '../db'
import { HttpError, sendError } from '../http'
import { requireBookId, requireParamId, queryString } from './helpers'
import { reverseJournalEntry } from './postingService'

// transaction_id and reversed_by_entry_id are both derived by lookup, not stored columns: the entry<->
// transaction link only exists in one direction (accounting_transactions.journal_entry_id - see the schema
// migration's comment on accounting_journal_entries for why), and "reversed" is answered by whether another
// entry exists pointing back at this one via reversal_of_entry_id, since a reversed entry's own status never
// changes away from 'posted'.
const JOURNAL_ENTRY_SELECT = `
  SELECT je.id, je.book_id, ab.code AS book_code, je.entry_date, je.reference, je.description, je.status,
         je.reversal_of_entry_id, je.posted_at, je.created_at, je.currency_code, je.entry_kind,
         (SELECT t.id FROM accounting_transactions t WHERE t.journal_entry_id = je.id) AS transaction_id,
         (SELECT r.id FROM accounting_journal_entries r WHERE r.reversal_of_entry_id = je.id) AS reversed_by_entry_id,
         coalesce(totals.total_debit, 0) AS total_debit, coalesce(totals.total_credit, 0) AS total_credit
  FROM accounting_journal_entries je
  JOIN accounting_books ab ON ab.id = je.book_id
  LEFT JOIN (
    SELECT journal_entry_id, sum(debit) AS total_debit, sum(credit) AS total_credit
    FROM accounting_journal_lines GROUP BY journal_entry_id
  ) totals ON totals.journal_entry_id = je.id`

function requireEntryId(req: Request) {
  return requireParamId(req, 'entryId', 'Journal entry')
}

export function registerAccountingJournalRoutes(app: Express) {
  app.get('/api/accounting/journal-entries', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const conditions = ['je.book_id = $1']
      const params: unknown[] = [bookId]

      const status = queryString(req.query.status)
      if (status) { params.push(status); conditions.push(`je.status = $${params.length}`) }
      const dateFrom = queryString(req.query.date_from)
      if (dateFrom) { params.push(dateFrom); conditions.push(`je.entry_date >= $${params.length}`) }
      const dateTo = queryString(req.query.date_to)
      if (dateTo) { params.push(dateTo); conditions.push(`je.entry_date <= $${params.length}`) }

      const result = await pool.query(
        `${JOURNAL_ENTRY_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY je.entry_date DESC, je.id DESC LIMIT 500`,
        params
      )
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch journal entries')
    }
  })

  app.get('/api/accounting/journal-entries/:entryId', async (req, res) => {
    try {
      const id = requireEntryId(req)
      const entry = await pool.query(`${JOURNAL_ENTRY_SELECT} WHERE je.id = $1`, [id])
      if (entry.rows.length === 0) throw new HttpError(404, 'Journal entry not found')

      const lines = await pool.query(
        `SELECT jl.id, jl.account_id, aa.name AS account_name, aa.type AS account_type, jl.debit, jl.credit,
                jl.project_id, projects.name AS project_name,
                jl.counterparty_id, cp.name AS counterparty_name,
                jl.cash_account_id, ca.name AS cash_account_name, jl.memo
         FROM accounting_journal_lines jl
         JOIN accounting_accounts aa ON aa.id = jl.account_id
         LEFT JOIN projects ON projects.id = jl.project_id
         LEFT JOIN accounting_counterparties cp ON cp.id = jl.counterparty_id
         LEFT JOIN accounting_cash_accounts ca ON ca.id = jl.cash_account_id
         WHERE jl.journal_entry_id = $1
         ORDER BY jl.id`,
        [id]
      )
      res.json({ ...entry.rows[0], lines: lines.rows })
    } catch (err) {
      sendError(res, err, 'Failed to fetch journal entry')
    }
  })

  app.post('/api/accounting/journal-entries/:entryId/reverse', async (req, res) => {
    try {
      const id = requireEntryId(req)
      const reason = typeof req.body?.reason === 'string' && req.body.reason.trim() ? req.body.reason.trim() : null
      const userId = req.user!.id
      const result = await reverseJournalEntry(id, userId, reason)
      const entry = await pool.query(`${JOURNAL_ENTRY_SELECT} WHERE je.id = $1`, [result.reversalEntryId])
      res.status(201).json(entry.rows[0])
    } catch (err) {
      sendError(res, err, 'Failed to reverse the journal entry')
    }
  })
}
