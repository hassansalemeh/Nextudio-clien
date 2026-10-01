import type { PoolClient } from 'pg'
import { pool } from '../../db'

type Queryable = { query: PoolClient['query'] }

export const PAYMENT_SELECT = `
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

export async function selectPayments(projectId: string | null) {
  const result = await pool.query(
    `${PAYMENT_SELECT} ${projectId ? 'WHERE payments.project_id = $1' : ''}
     ORDER BY payments.payment_date DESC, payments.id DESC`,
    projectId ? [projectId] : []
  )
  return result.rows
}

export async function selectPaymentById(id: string | number, db: Queryable = pool) {
  const result = await db.query(`${PAYMENT_SELECT} WHERE payments.id = $1`, [id])
  return result.rows[0] ?? null
}

export async function selectProjectExists(client: PoolClient, projectId: string) {
  const result = await client.query('SELECT id FROM projects WHERE id = $1', [projectId])
  return result.rows.length > 0
}

export async function selectPaymentDateNotInFuture(client: PoolClient, paymentDate: string) {
  const result = await client.query('SELECT $1::date <= current_date + 1 AS ok', [paymentDate])
  return result.rows[0].ok as boolean
}

export async function selectInvoiceForPaymentCheck(client: PoolClient, invoiceId: string, projectId: string) {
  const result = await client.query(
    `SELECT invoices.id, invoices.total FROM invoices
     WHERE invoices.id = $1 AND invoices.project_id = $2 FOR UPDATE OF invoices`,
    [invoiceId, projectId]
  )
  return result.rows[0] ?? null
}

export async function selectOtherPaymentsTotalForInvoice(client: PoolClient, invoiceId: string, excludePaymentId: string | null) {
  const result = await client.query(
    'SELECT coalesce(sum(amount), 0) AS paid FROM payments WHERE invoice_id = $1 AND ($2::bigint IS NULL OR id <> $2)',
    [invoiceId, excludePaymentId]
  )
  return result.rows[0].paid
}

export async function insertPayment(
  client: PoolClient,
  input: { project_id: string; invoice_id: string | null; payment_date: string; amount: number; reason: string; method: string | null; reference: string | null }
) {
  const result = await client.query(
    `INSERT INTO payments (project_id, invoice_id, payment_date, amount, reason, method, reference)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.project_id, input.invoice_id, input.payment_date, input.amount, input.reason, input.method, input.reference]
  )
  return result.rows[0].id
}

export async function selectPaymentRowForUpdate(client: PoolClient, id: string) {
  const result = await client.query('SELECT to_jsonb(payments) AS row FROM payments WHERE id = $1 FOR UPDATE', [id])
  return result.rows[0] ?? null
}

export async function insertPaymentRevision(client: PoolClient, id: string, previous: unknown) {
  await client.query('INSERT INTO payment_revisions (payment_id, previous) VALUES ($1, $2)', [id, previous])
}

export async function updatePayment(
  client: PoolClient,
  id: string,
  input: { project_id: string; invoice_id: string | null; payment_date: string; amount: number; reason: string; method: string | null; reference: string | null }
) {
  await client.query(
    `UPDATE payments SET project_id = $2, invoice_id = $3, payment_date = $4, amount = $5, reason = $6,
                         method = $7, reference = $8, updated_at = now()
     WHERE id = $1`,
    [id, input.project_id, input.invoice_id, input.payment_date, input.amount, input.reason, input.method, input.reference]
  )
}
