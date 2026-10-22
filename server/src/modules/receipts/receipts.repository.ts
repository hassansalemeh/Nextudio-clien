import type { PoolClient } from 'pg'
import { pool } from '../../db'

type Queryable = { query: PoolClient['query'] }

export const RECEIPT_SELECT = `
  SELECT receipts.id, receipts.receipt_number,
         to_char(receipts.receipt_date, 'YYYY-MM-DD') AS receipt_date,
         receipts.client_id, receipts.project_id,
         receipts.receiver_name, receipts.receiver_email,
         receipts.amount, receipts.currency, receipts.reason,
         receipts.issued_by_admin, receipts.issued_by_signer_id,
         receipts.received_by_admin, receipts.received_by_signer_id,
         receipts.show_paid_stamp, receipts.show_company_stamp,
         receipts.document_language, receipts.payment_id,
         receipts.cancelled_at, receipts.cancel_reason
  FROM receipts`

export async function selectReceipts(organizationId: string) {
  const result = await pool.query(`${RECEIPT_SELECT} WHERE receipts.organization_id = $1 ORDER BY receipts.receipt_date DESC, receipts.id DESC`, [
    organizationId,
  ])
  return result.rows
}

export async function selectReceiptById(organizationId: string, id: string | number, db: Queryable = pool) {
  const result = await db.query(`${RECEIPT_SELECT} WHERE receipts.id = $1 AND receipts.organization_id = $2`, [id, organizationId])
  return result.rows[0] ?? null
}

export async function selectAllReceiptNumbers(organizationId: string, db: Queryable = pool) {
  const result = await db.query('SELECT receipt_number FROM receipts WHERE organization_id = $1', [organizationId])
  return result.rows as { receipt_number: string }[]
}

export async function selectReceiptNumberTaken(organizationId: string, number: string, db: Queryable = pool) {
  const result = await db.query('SELECT 1 FROM receipts WHERE organization_id = $1 AND lower(receipt_number) = lower($2)', [organizationId, number])
  return result.rows.length > 0
}

export async function assertClientExists(db: Queryable, organizationId: string, clientId: unknown) {
  if (!clientId) return true
  const result = await db.query('SELECT 1 FROM clients WHERE id = $1 AND organization_id = $2', [clientId, organizationId])
  return result.rows.length > 0
}

export async function assertProjectExists(db: Queryable, organizationId: string, projectId: unknown) {
  if (!projectId) return true
  const result = await db.query('SELECT 1 FROM projects WHERE id = $1 AND organization_id = $2', [projectId, organizationId])
  return result.rows.length > 0
}

export async function selectClientIdForProject(db: Queryable, organizationId: string, projectId: string) {
  const result = await db.query('SELECT client_id FROM projects WHERE id = $1 AND organization_id = $2', [projectId, organizationId])
  return (result.rows[0]?.client_id as string | undefined) ?? null
}

// Locks the payment being linked to a new receipt, together with the project/client it belongs to -
// those become the receipt's own project_id/client_id/amount/receipt_date. cancelled_at is included so
// createReceipt can refuse to attach a new receipt to a cancelled payment.
export async function lockPaymentForLinking(client: PoolClient, organizationId: string, paymentId: string) {
  const result = await client.query(
    `SELECT payments.id, payments.project_id, projects.client_id, payments.amount, payments.cancelled_at,
            to_char(payments.payment_date, 'YYYY-MM-DD') AS payment_date
     FROM payments JOIN projects ON projects.id = payments.project_id
     WHERE payments.id = $1 AND payments.organization_id = $2 FOR UPDATE OF payments`,
    [paymentId, organizationId]
  )
  return result.rows[0] ?? null
}

// A payment can have at most one receipt - this is how createReceipt checks before linking.
export async function selectReceiptForPayment(client: PoolClient, paymentId: string) {
  const result = await client.query('SELECT id, receipt_number FROM receipts WHERE payment_id = $1', [paymentId])
  return result.rows[0] ?? null
}

export type ReceiptHeader = {
  receipt_number: string
  receipt_date: string
  client_id: unknown
  project_id: unknown
  receiver_name: string
  receiver_email: string | null
  amount: number
  currency: string
  reason: string
  // issued_by_admin/received_by_admin are text SNAPSHOTS of the chosen signer's display_name at the
  // moment of this save - renaming or deactivating that signer later never changes these
  issued_by_admin: string
  issued_by_signer_id: unknown
  received_by_admin: string
  received_by_signer_id: unknown
  show_paid_stamp: boolean
  show_company_stamp: boolean
  document_language: string
  payment_id: unknown
}

export async function insertReceipt(client: PoolClient, organizationId: string, header: ReceiptHeader) {
  const inserted = await client.query(
    `INSERT INTO receipts (organization_id, receipt_number, receipt_date, client_id, project_id, receiver_name, receiver_email,
                           amount, currency, reason, issued_by_admin, issued_by_signer_id, received_by_admin, received_by_signer_id,
                           show_paid_stamp, show_company_stamp, document_language, payment_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING id`,
    [
      organizationId, header.receipt_number, header.receipt_date, header.client_id, header.project_id, header.receiver_name,
      header.receiver_email, header.amount, header.currency, header.reason, header.issued_by_admin, header.issued_by_signer_id,
      header.received_by_admin, header.received_by_signer_id, header.show_paid_stamp, header.show_company_stamp,
      header.document_language, header.payment_id,
    ]
  )
  return inserted.rows[0].id
}

// payment_id is never updated - a receipt's linked payment can't be swapped after creation
export async function updateReceipt(client: PoolClient, organizationId: string, id: string, header: ReceiptHeader) {
  await client.query(
    `UPDATE receipts SET receipt_number = $3, receipt_date = $4, client_id = $5, project_id = $6, receiver_name = $7,
                         receiver_email = $8, amount = $9, currency = $10, reason = $11, issued_by_admin = $12,
                         issued_by_signer_id = $13, received_by_admin = $14, received_by_signer_id = $15,
                         show_paid_stamp = $16, show_company_stamp = $17, document_language = $18, updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [
      id, organizationId, header.receipt_number, header.receipt_date, header.client_id, header.project_id, header.receiver_name,
      header.receiver_email, header.amount, header.currency, header.reason, header.issued_by_admin, header.issued_by_signer_id,
      header.received_by_admin, header.received_by_signer_id, header.show_paid_stamp, header.show_company_stamp,
      header.document_language,
    ]
  )
}

export async function lockReceiptForUpdate(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query(
    `SELECT id, payment_id, amount, to_char(receipt_date, 'YYYY-MM-DD') AS receipt_date, project_id, client_id, cancelled_at
     FROM receipts WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [id, organizationId]
  )
  return result.rows[0] ?? null
}

export async function lockReceiptForCancel(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query(
    'SELECT id, payment_id, cancelled_at FROM receipts WHERE id = $1 AND organization_id = $2 FOR UPDATE',
    [id, organizationId]
  )
  return result.rows[0] ?? null
}

// Cancelling a receipt always cancels its payment too, in the same transaction
export async function updateReceiptCancelled(client: PoolClient, id: string, cancelledBy: string, reason: string) {
  await client.query('UPDATE receipts SET cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 WHERE id = $1', [id, cancelledBy, reason])
}
