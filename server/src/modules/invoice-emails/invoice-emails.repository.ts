import { pool } from '../../db'
import type { PoolClient } from 'pg'

const EMAIL_HISTORY_SELECT = `
  SELECT id, recipient, cc, subject, message, status, error, sent_by_email, sent_at
  FROM invoice_emails WHERE invoice_id = $1 ORDER BY sent_at DESC, id DESC`

export async function selectInvoiceEmailHistory(invoiceId: string) {
  const result = await pool.query(EMAIL_HISTORY_SELECT, [invoiceId])
  return result.rows
}

export async function insertFailedInvoiceEmail(
  id: string,
  to: string,
  cc: string | null,
  subject: string,
  message: string,
  error: string,
  sentByUserId: string,
  sentByEmail: string
) {
  await pool.query(
    `INSERT INTO invoice_emails (invoice_id, recipient, cc, subject, message, status, error, sent_by_user_id, sent_by_email)
     VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7, $8)`,
    [id, to, cc, subject, message, error, sentByUserId, sentByEmail]
  )
}

export async function insertSentInvoiceEmail(
  client: PoolClient,
  id: string,
  to: string,
  cc: string | null,
  subject: string,
  message: string,
  sentByUserId: string,
  sentByEmail: string
) {
  const inserted = await client.query(
    `INSERT INTO invoice_emails (invoice_id, recipient, cc, subject, message, status, sent_by_user_id, sent_by_email)
     VALUES ($1, $2, $3, $4, $5, 'sent', $6, $7)
     RETURNING id, recipient, cc, subject, message, status, error, sent_by_email, sent_at`,
    [id, to, cc, subject, message, sentByUserId, sentByEmail]
  )
  return inserted.rows[0]
}
