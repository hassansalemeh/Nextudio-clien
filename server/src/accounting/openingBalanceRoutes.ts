import type { Express } from 'express'
import { pool } from '../db'
import { sendError } from '../http'
import { parseOpeningBalanceInput, postOpeningBalance } from './postingService'

// Architecture only, per Phase 1B: this route exists and is fully functional, but nothing in the UI calls
// it with real numbers yet - opening balances are entered later, only once verified, exactly like every
// other posting (a proper balanced journal entry against Opening Balance Equity, never a raw balance field).
export function registerAccountingOpeningBalanceRoutes(app: Express) {
  app.post('/api/accounting/opening-balances', async (req, res) => {
    try {
      const userId = req.user!.id
      const input = parseOpeningBalanceInput(req.body, userId)
      const posted = await postOpeningBalance(input)
      const entry = await pool.query(
        `SELECT je.id, je.book_id, ab.code AS book_code, je.entry_date, je.reference, je.description, je.status, je.posted_at, je.currency_code, je.entry_kind
         FROM accounting_journal_entries je JOIN accounting_books ab ON ab.id = je.book_id
         WHERE je.id = $1`,
        [posted.journalEntryId]
      )
      res.status(201).json(entry.rows[0])
    } catch (err) {
      sendError(res, err, 'Failed to post the opening balance')
    }
  })
}
