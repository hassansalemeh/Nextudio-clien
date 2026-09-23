import type { Express, Request } from 'express'
import type { PoolClient } from 'pg'
import { pool } from './db'
import { HttpError, isIsoDate, roundMoney, sendError, withTransaction } from './http'

// The only place payments are created or changed. A payment is money received from a client:
// it always belongs to a project and may also be applied to that project's invoice.
// Invoice paid/due, the project's payments, and the dashboard all sum this one table.

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'card', 'other']

const PAYMENT_SELECT = `
  SELECT payments.id, payments.project_id, projects.name AS project_name, clients.name AS client_name,
         payments.invoice_id, invoices.invoice_number, invoices.invoice_type,
         to_char(payments.payment_date, 'YYYY-MM-DD') AS payment_date,
         payments.amount, payments.reason, payments.method, payments.reference,
         payments.created_at, payments.updated_at,
         (SELECT count(*) FROM payment_revisions WHERE payment_revisions.payment_id = payments.id)::int AS edits
  FROM payments
  JOIN projects ON projects.id = payments.project_id
  JOIN clients ON clients.id = projects.client_id
  LEFT JOIN invoices ON invoices.id = payments.invoice_id`

type PaymentInput = {
  project_id: string
  invoice_id: string | null
  payment_date: string
  amount: number
  reason: string
  method: string | null
  reference: string | null
}

function parsePayment(body: Record<string, unknown>): PaymentInput {
  const project_id = body.project_id
  const payment_date = body.payment_date
  const amount = body.amount
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const method = body.method === undefined || body.method === null || body.method === '' ? null : body.method
  const reference = typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim() : null

  if (project_id === undefined || project_id === null || project_id === '' || !/^\d+$/.test(String(project_id))) {
    throw new HttpError(400, 'Choose a project')
  }
  if (!isIsoDate(payment_date)) throw new HttpError(400, 'Payment date is required')
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Amount received must be greater than 0')
  }
  if (!reason) throw new HttpError(400, 'Enter a reason for the payment (for example: Down payment)')
  if (reason.length > 200) throw new HttpError(400, 'The reason is too long (200 characters at most)')
  if (method !== null && (typeof method !== 'string' || !PAYMENT_METHODS.includes(method))) {
    throw new HttpError(400, 'Payment method must be one of: ' + PAYMENT_METHODS.join(', '))
  }
  if (reference && reference.length > 500) throw new HttpError(400, 'The reference is too long (500 characters at most)')

  const invoice_id = body.invoice_id === undefined || body.invoice_id === null || body.invoice_id === '' ? null : String(body.invoice_id)
  if (invoice_id !== null && !/^\d+$/.test(invoice_id)) throw new HttpError(400, 'Invalid invoice')

  return { project_id: String(project_id), invoice_id, payment_date, amount: roundMoney(amount), reason, method, reference }
}

// Validates a payment against the project and (if applied to one) its invoice. `paymentId` excludes a payment from
// its own invoice total when it is being corrected.
async function checkPayment(client: PoolClient, input: PaymentInput, paymentId: string | null) {
  const project = await client.query('SELECT id FROM projects WHERE id = $1', [input.project_id])
  if (project.rows.length === 0) throw new HttpError(400, 'Project does not exist')

  // a payment date can't be in the future (a day of tolerance for time zones)
  const dateCheck = await client.query('SELECT $1::date <= current_date + 1 AS ok', [input.payment_date])
  if (!dateCheck.rows[0].ok) throw new HttpError(400, 'The payment date cannot be in the future')

  if (input.invoice_id !== null) {
    // the invoice must be this project's own invoice; lock it so simultaneous payments can't both pass
    const invoice = await client.query(
      `SELECT invoices.id, invoices.total FROM invoices
       WHERE invoices.id = $1 AND invoices.project_id = $2 FOR UPDATE OF invoices`,
      [input.invoice_id, input.project_id]
    )
    if (invoice.rows.length === 0) throw new HttpError(400, 'That invoice does not belong to this project')

    const others = await client.query(
      'SELECT coalesce(sum(amount), 0) AS paid FROM payments WHERE invoice_id = $1 AND ($2::bigint IS NULL OR id <> $2)',
      [input.invoice_id, paymentId]
    )
    const due = roundMoney(Number(invoice.rows[0].total) - Number(others.rows[0].paid))
    if (input.amount > due) {
      throw new HttpError(400, `This payment is more than the amount due on the invoice (${due.toFixed(2)})`)
    }
  }
}

export async function loadPayment(id: string | number, db: { query: PoolClient['query'] } = pool) {
  const result = await db.query(`${PAYMENT_SELECT} WHERE payments.id = $1`, [id])
  return result.rows[0] ?? null
}

function requireId(req: Request) {
  const id = req.params.paymentId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Payment not found')
  return id
}

export function registerPaymentRoutes(app: Express) {
  // newest first
  app.get('/api/payments', async (req, res) => {
    try {
      const projectId = typeof req.query.project_id === 'string' && /^\d+$/.test(req.query.project_id) ? req.query.project_id : null
      const result = await pool.query(
        `${PAYMENT_SELECT} ${projectId ? 'WHERE payments.project_id = $1' : ''}
         ORDER BY payments.payment_date DESC, payments.id DESC`,
        projectId ? [projectId] : []
      )
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch payments')
    }
  })

  app.post('/api/payments', async (req, res) => {
    try {
      const input = parsePayment(req.body)
      const id = await withTransaction(async (client) => {
        await checkPayment(client, input, null)
        const inserted = await client.query(
          `INSERT INTO payments (project_id, invoice_id, payment_date, amount, reason, method, reference)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [input.project_id, input.invoice_id, input.payment_date, input.amount, input.reason, input.method, input.reference]
        )
        return inserted.rows[0].id
      })
      res.status(201).json(await loadPayment(id))
    } catch (err) {
      sendError(res, err, 'Failed to record the payment')
    }
  })

  // A correction: what the payment looked like before is kept in payment_revisions. Payments are never deleted.
  app.put('/api/payments/:paymentId', async (req, res) => {
    try {
      const id = requireId(req)
      const input = parsePayment(req.body)
      await withTransaction(async (client) => {
        const current = await client.query('SELECT to_jsonb(payments) AS row FROM payments WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Payment not found')
        await checkPayment(client, input, id)
        await client.query('INSERT INTO payment_revisions (payment_id, previous) VALUES ($1, $2)', [id, current.rows[0].row])
        await client.query(
          `UPDATE payments SET project_id = $2, invoice_id = $3, payment_date = $4, amount = $5, reason = $6,
                               method = $7, reference = $8, updated_at = now()
           WHERE id = $1`,
          [id, input.project_id, input.invoice_id, input.payment_date, input.amount, input.reason, input.method, input.reference]
        )
      })
      res.json(await loadPayment(id))
    } catch (err) {
      sendError(res, err, 'Failed to correct the payment')
    }
  })
}
