import type { PoolClient } from 'pg'
import { pool } from '../../db'

type Queryable = { query: PoolClient['query'] }

export const PAYMENT_SELECT = `
  SELECT payments.id, payments.project_id, projects.name AS project_name, clients.name AS client_name,
         payments.invoice_id, invoices.invoice_number, invoices.invoice_type,
         to_char(payments.payment_date, 'YYYY-MM-DD') AS payment_date,
         payments.amount, payments.reason, payments.method, payments.reference,
         payments.created_at, payments.updated_at,
         payments.cancelled_at, payments.cancel_reason,
         receipts.id AS receipt_id, receipts.receipt_number,
         (SELECT count(*) FROM payment_revisions WHERE payment_revisions.payment_id = payments.id)::int AS edits
  FROM payments
  JOIN projects ON projects.id = payments.project_id
  JOIN clients ON clients.id = projects.client_id
  LEFT JOIN invoices ON invoices.id = payments.invoice_id
  LEFT JOIN receipts ON receipts.payment_id = payments.id`

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
    'SELECT coalesce(sum(amount), 0) AS paid FROM payments WHERE invoice_id = $1 AND cancelled_at IS NULL AND ($2::bigint IS NULL OR id <> $2)',
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

// A payment with an ACTIVE receipt can't be corrected or cancelled directly - the receipt was signed and
// handed over based on these values, so the receipt has to be cancelled first (which cancels the payment
// along with it). A cancelled receipt's payment is already cancelled too, so it never shows up here.
export async function selectActiveReceiptForPayment(client: PoolClient, paymentId: string) {
  const result = await client.query('SELECT id, receipt_number FROM receipts WHERE payment_id = $1 AND cancelled_at IS NULL', [paymentId])
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

export async function lockPaymentForCancel(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query('SELECT id, cancelled_at FROM payments WHERE id = $1 AND organization_id = $2 FOR UPDATE', [id, organizationId])
  return result.rows[0] ?? null
}

// Used both for a direct "Cancel payment" action and from receipts.service when cancelling a receipt
// cancels its payment along with it - either way, the same three columns move together.
export async function updatePaymentCancelled(client: PoolClient, id: string, cancelledBy: string, reason: string) {
  await client.query('UPDATE payments SET cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 WHERE id = $1', [id, cancelledBy, reason])
}
