import type { Express, Request } from 'express'
import { pool } from './db'
import { HttpError, roundMoney, sendError } from './http'

export function invoiceStatus(total: number, paid: number): 'unpaid' | 'partially_paid' | 'paid' {
  if (paid <= 0) return 'unpaid'
  return paid >= total ? 'paid' : 'partially_paid'
}

const INVOICE_SELECT = `
  SELECT invoices.id, invoices.invoice_number, invoices.client_id, clients.name AS client_name,
         clients.phone AS client_phone, clients.email AS client_email,
         invoices.contact_name, invoices.title, invoices.summary,
         to_char(invoices.invoice_date, 'YYYY-MM-DD') AS invoice_date,
         to_char(invoices.due_date, 'YYYY-MM-DD') AS due_date,
         invoices.currency, invoices.notes, invoices.payment_terms, invoices.timeline, invoices.exclusions,
         invoices.project_location, invoices.introduction,
         invoices.subtotal, invoices.discount_type, invoices.discount_value,
         invoices.discount, invoices.total, invoices.estimate_id, estimates.estimate_number,
         projects.id AS project_id, projects.name AS project_name,
         coalesce((SELECT sum(amount) FROM payments WHERE payments.invoice_id = invoices.id), 0) AS paid
  FROM invoices
  JOIN clients ON clients.id = invoices.client_id
  LEFT JOIN estimates ON estimates.id = invoices.estimate_id
  LEFT JOIN projects ON projects.source_invoice_id = invoices.id`

// Amount paid, amount due and status are always derived from the payment records
function withBalance<T extends { total: string; paid: string }>(row: T) {
  const total = Number(row.total)
  const paid = roundMoney(Number(row.paid))
  return { ...row, paid, amount_due: roundMoney(total - paid), status: invoiceStatus(total, paid) }
}

export async function listInvoices() {
  const result = await pool.query(`${INVOICE_SELECT} ORDER BY invoices.invoice_date DESC, invoices.id DESC`)
  return result.rows.map(withBalance)
}

export async function loadInvoice(invoiceId: string | number) {
  const result = await pool.query(`${INVOICE_SELECT} WHERE invoices.id = $1`, [invoiceId])
  if (result.rows.length === 0) return null
  const items = await pool.query(
    `SELECT id, position, name, description, quantity, unit, unit_price, amount
     FROM invoice_items WHERE invoice_id = $1 ORDER BY position, id`,
    [invoiceId]
  )
  const payments = await pool.query(
    `SELECT id, to_char(payment_date, 'YYYY-MM-DD') AS payment_date, amount, reason, method, reference, created_at
     FROM payments WHERE invoice_id = $1 ORDER BY payment_date, id`,
    [invoiceId]
  )
  return { ...withBalance(result.rows[0]), items: items.rows, payments: payments.rows }
}

function requireId(req: Request) {
  const id = req.params.invoiceId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Invoice not found')
  return id
}

export function registerInvoiceRoutes(app: Express) {
  app.get('/api/invoices', async (_req, res) => {
    try {
      res.json(await listInvoices())
    } catch (err) {
      sendError(res, err, 'Failed to fetch invoices')
    }
  })

  app.get('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const invoice = await loadInvoice(requireId(req))
      if (!invoice) throw new HttpError(404, 'Invoice not found')
      res.json(invoice)
    } catch (err) {
      sendError(res, err, 'Failed to fetch invoice')
    }
  })
}
