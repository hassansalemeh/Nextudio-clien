import type { Express } from 'express'
import { pool } from '../db'
import { sendError } from '../http'

export function registerAccountingBookRoutes(app: Express) {
  app.get('/api/accounting/books', async (_req, res) => {
    try {
      const result = await pool.query('SELECT id, code, name, currency_code, is_active FROM accounting_books ORDER BY id')
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch accounting books')
    }
  })
}
