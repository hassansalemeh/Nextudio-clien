import { pool } from '../../db'
import type { PoolClient } from 'pg'

const EMAIL_HISTORY_SELECT = `
  SELECT id, recipient, cc, subject, message, status, error, sent_by_email, sent_at
  FROM estimate_emails WHERE estimate_id = $1 ORDER BY sent_at DESC, id DESC`

export async function selectEstimateEmailHistory(estimateId: string) {
  const result = await pool.query(EMAIL_HISTORY_SELECT, [estimateId])
  return result.rows
}

export async function insertFailedEstimateEmail(
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
    `INSERT INTO estimate_emails (estimate_id, recipient, cc, subject, message, status, error, sent_by_user_id, sent_by_email)
     VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7, $8)`,
    [id, to, cc, subject, message, error, sentByUserId, sentByEmail]
  )
}

// Success: record it, and move Draft -> Pending (never auto-approve). Both happen together.
export async function insertSentEstimateEmailAndAdvanceStatus(
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
    `INSERT INTO estimate_emails (estimate_id, recipient, cc, subject, message, status, sent_by_user_id, sent_by_email)
     VALUES ($1, $2, $3, $4, $5, 'sent', $6, $7)
     RETURNING id, recipient, cc, subject, message, status, error, sent_by_email, sent_at`,
    [id, to, cc, subject, message, sentByUserId, sentByEmail]
  )
  await client.query(`UPDATE estimates SET status = 'pending', updated_at = now() WHERE id = $1 AND status = 'draft'`, [id])
  return inserted.rows[0]
}
