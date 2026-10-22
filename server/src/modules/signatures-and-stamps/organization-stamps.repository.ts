import type { PoolClient } from 'pg'
import { pool } from '../../db'

export type StampKind = 'paid_stamp' | 'company_stamp'

export type OrganizationStampRow = {
  id: string
  kind: StampKind
  mime_type: string | null
  image: Buffer | null
  updated_at: string
}

export async function selectStamps(organizationId: string): Promise<OrganizationStampRow[]> {
  const result = await pool.query('SELECT id, kind, mime_type, image, updated_at FROM organization_stamps WHERE organization_id = $1', [
    organizationId,
  ])
  return result.rows
}

export async function selectStampImage(organizationId: string, kind: StampKind) {
  const result = await pool.query('SELECT mime_type, image FROM organization_stamps WHERE organization_id = $1 AND kind = $2', [
    organizationId,
    kind,
  ])
  return result.rows[0] ?? null
}

export async function lockExistingStamp(client: PoolClient, organizationId: string, kind: StampKind) {
  const result = await client.query('SELECT id FROM organization_stamps WHERE organization_id = $1 AND kind = $2 FOR UPDATE', [
    organizationId,
    kind,
  ])
  return result.rows[0] ?? null
}

export async function updateStamp(client: PoolClient, id: string, mimeType: string, image: Buffer, updatedBy: string) {
  await client.query('UPDATE organization_stamps SET mime_type = $2, image = $3, updated_at = now(), updated_by = $4 WHERE id = $1', [
    id,
    mimeType,
    image,
    updatedBy,
  ])
}

export async function insertStamp(client: PoolClient, organizationId: string, kind: StampKind, mimeType: string, image: Buffer, updatedBy: string) {
  await client.query(
    'INSERT INTO organization_stamps (organization_id, kind, mime_type, image, updated_by) VALUES ($1, $2, $3, $4, $5)',
    [organizationId, kind, mimeType, image, updatedBy]
  )
}
