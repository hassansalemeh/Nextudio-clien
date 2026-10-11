import type { PoolClient } from 'pg'
import { pool } from '../../db'

type Queryable = { query: PoolClient['query'] }

export const LETTER_SELECT = `
  SELECT letters.id, letters.letter_number,
         to_char(letters.letter_date, 'YYYY-MM-DD') AS letter_date,
         letters.client_id, letters.project_id,
         letters.recipient_name, letters.subject, letters.body,
         letters.issued_by_admin, letters.document_language
  FROM letters`

export async function selectLetters(organizationId: string) {
  const result = await pool.query(`${LETTER_SELECT} WHERE letters.organization_id = $1 ORDER BY letters.letter_date DESC, letters.id DESC`, [
    organizationId,
  ])
  return result.rows
}

export async function selectLetterById(organizationId: string, id: string | number, db: Queryable = pool) {
  const result = await db.query(`${LETTER_SELECT} WHERE letters.id = $1 AND letters.organization_id = $2`, [id, organizationId])
  return result.rows[0] ?? null
}

export async function selectAllLetterNumbers(organizationId: string, db: Queryable = pool) {
  const result = await db.query('SELECT letter_number FROM letters WHERE organization_id = $1', [organizationId])
  return result.rows as { letter_number: string }[]
}

export async function selectLetterNumberTaken(organizationId: string, number: string, db: Queryable = pool) {
  const result = await db.query('SELECT 1 FROM letters WHERE organization_id = $1 AND lower(letter_number) = lower($2)', [organizationId, number])
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

export type LetterHeader = {
  letter_number: string
  letter_date: string
  client_id: unknown
  project_id: unknown
  recipient_name: string
  subject: string
  body: string
  issued_by_admin: string
  document_language: string
}

export async function insertLetter(client: PoolClient, organizationId: string, header: LetterHeader) {
  const inserted = await client.query(
    `INSERT INTO letters (organization_id, letter_number, letter_date, client_id, project_id, recipient_name, subject, body,
                          issued_by_admin, document_language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      organizationId, header.letter_number, header.letter_date, header.client_id, header.project_id, header.recipient_name,
      header.subject, header.body, header.issued_by_admin, header.document_language,
    ]
  )
  return inserted.rows[0].id
}

export async function updateLetter(client: PoolClient, organizationId: string, id: string, header: LetterHeader) {
  await client.query(
    `UPDATE letters SET letter_number = $3, letter_date = $4, client_id = $5, project_id = $6, recipient_name = $7,
                        subject = $8, body = $9, issued_by_admin = $10, document_language = $11, updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [
      id, organizationId, header.letter_number, header.letter_date, header.client_id, header.project_id, header.recipient_name,
      header.subject, header.body, header.issued_by_admin, header.document_language,
    ]
  )
}

export async function lockLetterForUpdate(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query('SELECT id FROM letters WHERE id = $1 AND organization_id = $2 FOR UPDATE', [id, organizationId])
  return result.rows[0] ?? null
}

export async function deleteLetterById(client: PoolClient, id: string) {
  // letter_emails is removed automatically (ON DELETE CASCADE)
  await client.query('DELETE FROM letters WHERE id = $1', [id])
}
