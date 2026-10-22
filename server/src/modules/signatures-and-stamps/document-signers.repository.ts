import type { PoolClient } from 'pg'
import { pool } from '../../db'

type Queryable = { query: PoolClient['query'] }

export type DocumentSignerRow = {
  id: string
  display_name: string
  is_active: boolean
  mime_type: string | null
  image: Buffer | null
  updated_at: string
}

export async function selectSigners(organizationId: string): Promise<DocumentSignerRow[]> {
  const result = await pool.query(
    'SELECT id, display_name, is_active, mime_type, image, updated_at FROM document_signers WHERE organization_id = $1 ORDER BY display_name',
    [organizationId]
  )
  return result.rows
}

export async function selectSignerImage(organizationId: string, id: string) {
  const result = await pool.query('SELECT mime_type, image FROM document_signers WHERE id = $1 AND organization_id = $2', [id, organizationId])
  return result.rows[0] ?? null
}

// Used when a receipt is created/corrected: the signer must be an ACTIVE signer of the receipt's own
// organization. Takes a Queryable so receipts.service can call it with its own transaction's client.
export async function selectSignerNameIfActive(db: Queryable, organizationId: string, signerId: string): Promise<string | null> {
  const result = await db.query('SELECT display_name FROM document_signers WHERE id = $1 AND organization_id = $2 AND is_active', [
    signerId,
    organizationId,
  ])
  return (result.rows[0]?.display_name as string | undefined) ?? null
}

export async function selectNameTaken(organizationId: string, name: string, excludeId: string | null) {
  const result = await pool.query(
    'SELECT 1 FROM document_signers WHERE organization_id = $1 AND lower(display_name) = lower($2) AND ($3::bigint IS NULL OR id <> $3)',
    [organizationId, name, excludeId]
  )
  return result.rows.length > 0
}

export async function insertSigner(organizationId: string, displayName: string) {
  const result = await pool.query('INSERT INTO document_signers (organization_id, display_name) VALUES ($1, $2) RETURNING id', [
    organizationId,
    displayName,
  ])
  return result.rows[0].id
}

// A signer can be renamed and deactivated/reactivated, but never deleted - a receipt may already
// reference it (receipts_issued_by_signer_same_org / receipts_received_by_signer_same_org, RESTRICT).
export async function updateSigner(organizationId: string, id: string, displayName: string, isActive: boolean): Promise<boolean> {
  const result = await pool.query(
    'UPDATE document_signers SET display_name = $3, is_active = $4, updated_at = now() WHERE id = $1 AND organization_id = $2',
    [id, organizationId, displayName, isActive]
  )
  return (result.rowCount ?? 0) > 0
}

export async function updateSignerImage(organizationId: string, id: string, mimeType: string, image: Buffer, updatedBy: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE document_signers SET mime_type = $3, image = $4, updated_at = now(), updated_by = $5 WHERE id = $1 AND organization_id = $2',
    [id, organizationId, mimeType, image, updatedBy]
  )
  return (result.rowCount ?? 0) > 0
}
