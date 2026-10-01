import type { PoolClient } from 'pg'
import { pool } from '../../db'

type Queryable = { query: PoolClient['query'] }

export const INVOICE_SELECT = `
  SELECT invoices.id, invoices.invoice_number, invoices.invoice_type, invoices.client_id,
         invoices.client_name, invoices.client_phone, invoices.client_email, invoices.client_address,
         invoices.contact_name, invoices.customer_ref, invoices.title, invoices.summary,
         to_char(invoices.invoice_date, 'YYYY-MM-DD') AS invoice_date,
         to_char(invoices.due_date, 'YYYY-MM-DD') AS due_date,
         invoices.currency, invoices.notes, invoices.payment_terms, invoices.timeline, invoices.exclusions,
         invoices.project_location, invoices.introduction, invoices.document_language,
         invoices.subtotal, invoices.discount_type, invoices.discount_value,
         invoices.discount, invoices.total, invoices.pricing_method, invoices.lump_sum_fee,
         -- Professional Services Invoice contract / Acceptance & Signatures - never set on a Client Funds invoice
         invoices.contract_terms, invoices.client_representative_name, invoices.client_representative_title,
         invoices.nextudio_representative_name, invoices.nextudio_representative_title,
         invoices.estimate_id, estimates.estimate_number,
         -- the forward link (both invoice types) falls back to the estimate-approval reverse link, for old rows
         coalesce(invoices.project_id, reverse_project.id) AS project_id,
         coalesce(fwd_project.name, reverse_project.name) AS project_name,
         coalesce((SELECT sum(amount) FROM payments WHERE payments.invoice_id = invoices.id), 0) AS paid
  FROM invoices
  LEFT JOIN estimates ON estimates.id = invoices.estimate_id
  LEFT JOIN projects fwd_project ON fwd_project.id = invoices.project_id
  LEFT JOIN projects reverse_project ON reverse_project.source_invoice_id = invoices.id`

export async function selectInvoices() {
  const result = await pool.query(`${INVOICE_SELECT} ORDER BY invoices.invoice_date DESC, invoices.id DESC`)
  return result.rows
}

export async function selectInvoiceById(invoiceId: string | number) {
  const result = await pool.query(`${INVOICE_SELECT} WHERE invoices.id = $1`, [invoiceId])
  return result.rows[0] ?? null
}

export async function selectInvoiceItems(invoiceId: string | number) {
  const result = await pool.query(
    `SELECT id, position, name, description, quantity, unit, unit_price, amount
     FROM invoice_items WHERE invoice_id = $1 ORDER BY position, id`,
    [invoiceId]
  )
  return result.rows
}

export async function selectInvoicePayments(invoiceId: string | number) {
  const result = await pool.query(
    `SELECT id, to_char(payment_date, 'YYYY-MM-DD') AS payment_date, amount, reason, method, reference, created_at
     FROM payments WHERE invoice_id = $1 ORDER BY payment_date, id`,
    [invoiceId]
  )
  return result.rows
}

export async function selectProjectForClientFunds(db: Queryable, projectId: string) {
  const result = await db.query('SELECT id, client_id, location FROM projects WHERE id = $1', [projectId])
  return result.rows[0] ?? null
}

export async function selectNextClientFundsSequence(db: Queryable = pool) {
  const result = await db.query("SELECT nextval('client_funds_invoice_number_seq') AS n")
  return result.rows[0].n
}

export async function deleteInvoiceItems(client: PoolClient, invoiceId: string | number) {
  await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId])
}

export async function insertInvoiceItem(
  client: PoolClient,
  invoiceId: string | number,
  position: number,
  item: { name: string; description: string | null; quantity: number; unit: string; unit_price: number }
) {
  await client.query(
    `INSERT INTO invoice_items (invoice_id, position, name, description, quantity, unit, unit_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [invoiceId, position, item.name, item.description, item.quantity, item.unit, item.unit_price]
  )
}

export async function updateInvoiceTotals(client: PoolClient, invoiceId: string | number, totals: { subtotal: number; discount: number; total: number }) {
  await client.query('UPDATE invoices SET subtotal = $2, discount = $3, total = $4 WHERE id = $1', [
    invoiceId,
    totals.subtotal,
    totals.discount,
    totals.total,
  ])
}

type ClientSnapshot = { client_name: string | null; client_email: string | null; client_phone: string | null; client_address: string | null }
type ClientFundsHeader = {
  client_id: string
  project_id: string
  invoice_number: string
  contact_name: string | null
  customer_ref: string | null
  title: string
  summary: string | null
  invoice_date: unknown
  due_date: unknown
  currency: string
  notes: string | null
  discount_type: unknown
  discount_value: unknown
  payment_terms: string | null
  timeline: string | null
  exclusions: string | null
  document_language: unknown
  introduction: string | null
}

export async function insertClientFundsInvoice(client: PoolClient, header: ClientFundsHeader, projectLocation: string | null, snapshot: ClientSnapshot) {
  const inserted = await client.query(
    `INSERT INTO invoices (invoice_type, invoice_number, client_id, project_id, contact_name, customer_ref,
                           title, summary, invoice_date, due_date, currency, notes, discount_type,
                           discount_value, payment_terms, timeline, exclusions, project_location, introduction,
                           document_language, client_name, client_email, client_phone, client_address,
                           subtotal, discount, total)
     VALUES ('client_funds', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
             $19, $20, $21, $22, $23, 0, 0, 0)
     RETURNING id`,
    [
      header.invoice_number, header.client_id, header.project_id, header.contact_name, header.customer_ref,
      header.title, header.summary, header.invoice_date, header.due_date, header.currency, header.notes,
      header.discount_type, header.discount_value, header.payment_terms, header.timeline, header.exclusions,
      projectLocation, header.introduction, header.document_language,
      snapshot.client_name, snapshot.client_email, snapshot.client_phone, snapshot.client_address,
    ]
  )
  return inserted.rows[0].id
}

export async function selectInvoiceForUpdate(client: PoolClient, invoiceId: string) {
  const result = await client.query(
    `SELECT invoices.invoice_type, invoices.client_id, invoices.client_name, invoices.client_email,
            invoices.client_phone, invoices.client_address,
            coalesce((SELECT sum(amount) FROM payments WHERE payments.invoice_id = invoices.id), 0) AS paid
     FROM invoices WHERE invoices.id = $1 FOR UPDATE`,
    [invoiceId]
  )
  return result.rows[0] ?? null
}

export async function updateClientFundsInvoice(client: PoolClient, id: string, header: ClientFundsHeader, projectLocation: string | null, snapshot: ClientSnapshot) {
  await client.query(
    `UPDATE invoices SET invoice_number = $2, client_id = $3, project_id = $4, contact_name = $5,
                         customer_ref = $6, title = $7, summary = $8, invoice_date = $9, due_date = $10,
                         currency = $11, notes = $12, discount_type = $13, discount_value = $14,
                         payment_terms = $15, timeline = $16, exclusions = $17, project_location = $18,
                         introduction = $19, document_language = $20,
                         client_name = $21, client_email = $22, client_phone = $23, client_address = $24
     WHERE id = $1`,
    [
      id, header.invoice_number, header.client_id, header.project_id, header.contact_name, header.customer_ref,
      header.title, header.summary, header.invoice_date, header.due_date, header.currency, header.notes,
      header.discount_type, header.discount_value, header.payment_terms, header.timeline, header.exclusions,
      projectLocation, header.introduction, header.document_language,
      snapshot.client_name, snapshot.client_email, snapshot.client_phone, snapshot.client_address,
    ]
  )
}

export async function selectInvoiceTypeForUpdate(client: PoolClient, id: string) {
  const result = await client.query('SELECT invoice_type FROM invoices WHERE id = $1 FOR UPDATE', [id])
  return result.rows[0] ?? null
}

export async function updateInvoiceContract(
  client: PoolClient,
  id: string,
  contract: {
    contract_terms: string | null
    client_representative_name: string | null
    client_representative_title: string | null
    nextudio_representative_name: string | null
    nextudio_representative_title: string | null
  }
) {
  await client.query(
    `UPDATE invoices SET contract_terms = $2, client_representative_name = $3, client_representative_title = $4,
                         nextudio_representative_name = $5, nextudio_representative_title = $6
     WHERE id = $1`,
    [
      id,
      contract.contract_terms,
      contract.client_representative_name,
      contract.client_representative_title,
      contract.nextudio_representative_name,
      contract.nextudio_representative_title,
    ]
  )
}
