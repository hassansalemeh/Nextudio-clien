import type { PoolClient } from 'pg'
import { pool } from '../../db'

type Queryable = { query: PoolClient['query'] }

export const RECEIPT_SELECT = `
  SELECT receipts.id, receipts.receipt_number,
         to_char(receipts.receipt_date, 'YYYY-MM-DD') AS receipt_date,
         receipts.client_id, receipts.project_id,
         receipts.receiver_name, receipts.receiver_email,
         receipts.amount, receipts.currency, receipts.reason,
         receipts.issued_by_admin, receipts.document_language
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
  issued_by_admin: string
  document_language: string
}

export async function insertReceipt(client: PoolClient, organizationId: string, header: ReceiptHeader) {
  const inserted = await client.query(
    `INSERT INTO receipts (organization_id, receipt_number, receipt_date, client_id, project_id, receiver_name, receiver_email,
                           amount, currency, reason, issued_by_admin, document_language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      organizationId, header.receipt_number, header.receipt_date, header.client_id, header.project_id, header.receiver_name,
      header.receiver_email, header.amount, header.currency, header.reason, header.issued_by_admin, header.document_language,
    ]
  )
  return inserted.rows[0].id
}

export async function updateReceipt(client: PoolClient, organizationId: string, id: string, header: ReceiptHeader) {
  await client.query(
    `UPDATE receipts SET receipt_number = $3, receipt_date = $4, client_id = $5, project_id = $6, receiver_name = $7,
                         receiver_email = $8, amount = $9, currency = $10, reason = $11, issued_by_admin = $12,
                         document_language = $13, updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [
      id, organizationId, header.receipt_number, header.receipt_date, header.client_id, header.project_id, header.receiver_name,
      header.receiver_email, header.amount, header.currency, header.reason, header.issued_by_admin, header.document_language,
    ]
  )
}

export async function lockReceiptForUpdate(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query('SELECT id FROM receipts WHERE id = $1 AND organization_id = $2 FOR UPDATE', [id, organizationId])
  return result.rows[0] ?? null
}
