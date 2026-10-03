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

export async function selectPayments(organizationId: string, projectId: string | null) {
  const result = await pool.query(
    `${PAYMENT_SELECT} WHERE payments.organization_id = $1 ${projectId ? 'AND payments.project_id = $2' : ''}
     ORDER BY payments.payment_date DESC, payments.id DESC`,
    projectId ? [organizationId, projectId] : [organizationId]
  )
  return result.rows
}

export async function selectPaymentById(organizationId: string, id: string | number, db: Queryable = pool) {
  const result = await db.query(`${PAYMENT_SELECT} WHERE payments.id = $1 AND payments.organization_id = $2`, [id, organizationId])
  return result.rows[0] ?? null
}

export async function selectProjectExists(client: PoolClient, organizationId: string, projectId: string) {
  const result = await client.query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2', [projectId, organizationId])
  return result.rows.length > 0
}

export async function selectPaymentDateNotInFuture(client: PoolClient, paymentDate: string) {
  const result = await client.query('SELECT $1::date <= current_date + 1 AS ok', [paymentDate])
  return result.rows[0].ok as boolean
}

export async function selectInvoiceForPaymentCheck(client: PoolClient, organizationId: string, invoiceId: string, projectId: string) {
  const result = await client.query(
    `SELECT invoices.id, invoices.total FROM invoices
     WHERE invoices.id = $1 AND invoices.project_id = $2 AND invoices.organization_id = $3 FOR UPDATE OF invoices`,
    [invoiceId, projectId, organizationId]
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
  organizationId: string,
  input: { project_id: string; invoice_id: string | null; payment_date: string; amount: number; reason: string; method: string | null; reference: string | null }
) {
  const result = await client.query(
    `INSERT INTO payments (organization_id, project_id, invoice_id, payment_date, amount, reason, method, reference)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [organizationId, input.project_id, input.invoice_id, input.payment_date, input.amount, input.reason, input.method, input.reference]
  )
  return result.rows[0].id
}

export async function selectPaymentRowForUpdate(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query('SELECT to_jsonb(payments) AS row FROM payments WHERE id = $1 AND organization_id = $2 FOR UPDATE', [
    id,
    organizationId,
  ])
  return result.rows[0] ?? null
}

export async function insertPaymentRevision(client: PoolClient, id: string, previous: unknown) {
  await client.query('INSERT INTO payment_revisions (payment_id, previous) VALUES ($1, $2)', [id, previous])
}

export async function updatePayment(
  client: PoolClient,
  organizationId: string,
  id: string,
  input: { project_id: string; invoice_id: string | null; payment_date: string; amount: number; reason: string; method: string | null; reference: string | null }
) {
  await client.query(
    `UPDATE payments SET project_id = $3, invoice_id = $4, payment_date = $5, amount = $6, reason = $7,
                         method = $8, reference = $9, updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [id, organizationId, input.project_id, input.invoice_id, input.payment_date, input.amount, input.reason, input.method, input.reference]
  )
}
