// How a Client Funds invoice's money was spent (contractor payments, materials, site expenses...).
// Simple record-keeping: never confused with `payments` (money coming in) or employee labor cost.
import type { Express, Request } from 'express'
import { pool } from './db'
import { HttpError, isIsoDate, roundMoney, sendError } from './http'

const DISBURSEMENT_SELECT = `
  SELECT id, invoice_id, to_char(disbursement_date, 'YYYY-MM-DD') AS disbursement_date, payee, description,
         category, amount, reference, created_at
  FROM invoice_disbursements WHERE invoice_id = $1 ORDER BY disbursement_date DESC, id DESC`

function requireInvoiceId(req: Request) {
  const id = req.params.invoiceId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Invoice not found')
  return id
}

async function requireClientFundsInvoice(invoiceId: string) {
  const result = await pool.query('SELECT invoice_type FROM invoices WHERE id = $1', [invoiceId])
  if (result.rows.length === 0) throw new HttpError(404, 'Invoice not found')
  if (result.rows[0].invoice_type !== 'client_funds') {
    throw new HttpError(400, 'Disbursements can only be recorded on a Client Funds invoice')
  }
}

function parseDisbursement(body: Record<string, unknown>) {
  const disbursement_date = body.disbursement_date
  const payee = typeof body.payee === 'string' ? body.payee.trim() : ''
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null
  const amount = body.amount
  const reference = typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim() : null

  if (!isIsoDate(disbursement_date)) throw new HttpError(400, 'Date is required')
  if (!payee) throw new HttpError(400, 'Enter who the money was paid to (payee / supplier / worker)')
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Amount must be greater than 0')
  }
  return { disbursement_date, payee, description, category, amount: roundMoney(amount), reference }
}

export function registerDisbursementRoutes(app: Express) {
  app.get('/api/invoices/:invoiceId/disbursements', async (req, res) => {
    try {
      const invoiceId = requireInvoiceId(req)
      await requireClientFundsInvoice(invoiceId)
      const result = await pool.query(DISBURSEMENT_SELECT, [invoiceId])
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch disbursements')
    }
  })

  app.post('/api/invoices/:invoiceId/disbursements', async (req, res) => {
    try {
      const invoiceId = requireInvoiceId(req)
      await requireClientFundsInvoice(invoiceId)
      const input = parseDisbursement(req.body)
      const userId = req.user!.id
      const inserted = await pool.query(
        `INSERT INTO invoice_disbursements (invoice_id, disbursement_date, payee, description, category, amount, reference, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, invoice_id, to_char(disbursement_date, 'YYYY-MM-DD') AS disbursement_date, payee, description,
                   category, amount, reference, created_at`,
        [invoiceId, input.disbursement_date, input.payee, input.description, input.category, input.amount, input.reference, userId]
      )
      res.status(201).json(inserted.rows[0])
    } catch (err) {
      sendError(res, err, 'Failed to record the disbursement')
    }
  })

  app.delete('/api/invoices/:invoiceId/disbursements/:disbursementId', async (req, res) => {
    try {
      const invoiceId = requireInvoiceId(req)
      await requireClientFundsInvoice(invoiceId)
      const disbursementId = req.params.disbursementId
      if (!/^\d+$/.test(disbursementId)) throw new HttpError(404, 'Disbursement not found')
      const result = await pool.query('DELETE FROM invoice_disbursements WHERE id = $1 AND invoice_id = $2', [disbursementId, invoiceId])
      if (result.rowCount === 0) throw new HttpError(404, 'Disbursement not found')
      res.status(204).end()
    } catch (err) {
      sendError(res, err, 'Failed to delete the disbursement')
    }
  })
}
