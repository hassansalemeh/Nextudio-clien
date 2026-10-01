import type { PoolClient } from 'pg'
import { pool } from '../../db'

export async function selectClients() {
  const result = await pool.query(
    'SELECT id, name, contact_name, email, phone, address, created_at FROM clients ORDER BY created_at DESC'
  )
  return result.rows
}

export async function insertClient(data: { name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }) {
  const result = await pool.query(
    'INSERT INTO clients (name, contact_name, email, phone, address) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, contact_name, email, phone, address, created_at',
    [data.name, data.contact_name, data.email, data.phone, data.address]
  )
  return result.rows[0]
}

export async function updateClient(
  clientId: string,
  data: { name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }
) {
  const result = await pool.query(
    `UPDATE clients SET name = $2, contact_name = $3, email = $4, phone = $5, address = $6
     WHERE id = $1
     RETURNING id, name, contact_name, email, phone, address, created_at`,
    [clientId, data.name, data.contact_name, data.email, data.phone, data.address]
  )
  return result.rows[0] ?? null
}

// Used by estimates/invoices to freeze a snapshot of the client's current data onto a document
export async function selectClientSnapshotSource(db: { query: PoolClient['query'] }, clientId: unknown) {
  const result = await db.query('SELECT name, email, phone, address FROM clients WHERE id = $1', [clientId])
  return result.rows[0] ?? null
}
