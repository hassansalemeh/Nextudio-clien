import type { PoolClient } from 'pg'

// Serializes a "pick the next free number, then insert" critical section per company, so two concurrent
// requests from the SAME company never both compute the same "highest + 1" before either has inserted.
// Scoped per company (not global), so two different companies are never blocked by each other, and per
// `kind` (e.g. 'estimate_number'), so unrelated numbering series don't serialize against each other.
// Held only for the rest of the current transaction - pg_advisory_xact_lock auto-releases at COMMIT/ROLLBACK.
export async function lockForNumbering(client: PoolClient, organizationId: string, kind: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${kind}:${organizationId}`])
}
