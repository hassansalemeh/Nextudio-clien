import type { PoolClient } from 'pg'
import { pool } from '../../db'

export async function selectClients(organizationId: string) {
  const result = await pool.query(
    `SELECT id, name, contact_name, email, phone, address, created_at
     FROM clients
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId]
  )
  return result.rows
}

export async function insertClient(
  organizationId: string,
  data: { name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }
) {
  const result = await pool.query(
    `INSERT INTO clients (organization_id, name, contact_name, email, phone, address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, contact_name, email, phone, address, created_at`,
    [organizationId, data.name, data.contact_name, data.email, data.phone, data.address]
  )
  return result.rows[0]
}

// Only updates the client if it belongs to this company; otherwise returns null ("not found")
export async function updateClient(
  organizationId: string,
  clientId: string,
  data: { name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }
) {
  const result = await pool.query(
    `UPDATE clients SET name = $3, contact_name = $4, email = $5, phone = $6, address = $7
     WHERE id = $1 AND organization_id = $2
     RETURNING id, name, contact_name, email, phone, address, created_at`,
    [clientId, organizationId, data.name, data.contact_name, data.email, data.phone, data.address]
  )
  return result.rows[0] ?? null
}

// Used by estimates/invoices to freeze a snapshot of the client's current data onto a document
export async function selectClientSnapshotSource(db: { query: PoolClient['query'] }, clientId: unknown) {
  const result = await db.query('SELECT name, email, phone, address FROM clients WHERE id = $1', [clientId])
  return result.rows[0] ?? null
}
