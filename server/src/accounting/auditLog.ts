import type { PoolClient } from 'pg'
import type { AuditAction, AuditEntityType } from './types'

// Every sensitive accounting action goes through here, always inside the same transaction as the
// mutation it records, so the audit row can never exist without the change it describes (or vice versa).
export async function writeAuditLog(
  client: PoolClient,
  entry: {
    book_id: string | null
    entity_type: AuditEntityType
    entity_id: string | number
    action: AuditAction
    performed_by_user_id: string | null
    before?: unknown
    after?: unknown
    notes?: string | null
  }
) {
  await client.query(
    `INSERT INTO accounting_audit_log (book_id, entity_type, entity_id, action, performed_by_user_id, before, after, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.book_id,
      entry.entity_type,
      entry.entity_id,
      entry.action,
      entry.performed_by_user_id,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.notes ?? null,
    ]
  )
}
