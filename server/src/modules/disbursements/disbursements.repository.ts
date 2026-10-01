import { pool } from '../../db'

const DISBURSEMENT_SELECT = `
  SELECT id, invoice_id, to_char(disbursement_date, 'YYYY-MM-DD') AS disbursement_date, payee, description,
         category, amount, reference, created_at
  FROM invoice_disbursements WHERE invoice_id = $1 ORDER BY disbursement_date DESC, id DESC`

export async function selectDisbursements(invoiceId: string) {
  const result = await pool.query(DISBURSEMENT_SELECT, [invoiceId])
  return result.rows
}

export async function selectInvoiceTypeById(invoiceId: string) {
  const result = await pool.query('SELECT invoice_type FROM invoices WHERE id = $1', [invoiceId])
  return result.rows[0] ?? null
}

export async function insertDisbursement(
  invoiceId: string,
  input: { disbursement_date: unknown; payee: string; description: string | null; category: string | null; amount: number; reference: string | null },
  userId: string
) {
  const result = await pool.query(
    `INSERT INTO invoice_disbursements (invoice_id, disbursement_date, payee, description, category, amount, reference, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, invoice_id, to_char(disbursement_date, 'YYYY-MM-DD') AS disbursement_date, payee, description,
               category, amount, reference, created_at`,
    [invoiceId, input.disbursement_date, input.payee, input.description, input.category, input.amount, input.reference, userId]
  )
  return result.rows[0]
}

export async function deleteDisbursement(invoiceId: string, disbursementId: string) {
  const result = await pool.query('DELETE FROM invoice_disbursements WHERE id = $1 AND invoice_id = $2', [disbursementId, invoiceId])
  return result.rowCount ?? 0
}
