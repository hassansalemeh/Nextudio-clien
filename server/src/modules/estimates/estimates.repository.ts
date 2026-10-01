import type { PoolClient } from 'pg'
import { pool } from '../../db'

type Queryable = { query: PoolClient['query'] }

export const ESTIMATE_SELECT = `
  SELECT estimates.id, estimates.estimate_number, estimates.title, estimates.summary,
         estimates.client_id, estimates.client_name, estimates.client_email, estimates.client_phone, estimates.client_address,
         estimates.contact_name, estimates.customer_ref,
         to_char(estimates.estimate_date, 'YYYY-MM-DD') AS estimate_date,
         to_char(estimates.valid_until, 'YYYY-MM-DD') AS valid_until,
         estimates.currency, estimates.status, estimates.notes, estimates.payment_terms, estimates.timeline, estimates.exclusions,
         estimates.project_location, estimates.introduction, estimates.document_language,
         estimates.subtotal, estimates.discount, estimates.discount_type, estimates.discount_value, estimates.total,
         estimates.pricing_method, estimates.lump_sum_fee,
         estimates.project_id, estimates.approved_at,
         invoices.id AS invoice_id, invoices.invoice_number,
         (SELECT projects.id FROM projects WHERE projects.source_estimate_id = estimates.id) AS created_project_id
  FROM estimates
  LEFT JOIN invoices ON invoices.estimate_id = estimates.id`

export async function selectEstimateHeaderById(estimateId: string | number, db: Queryable = pool) {
  const result = await db.query(`${ESTIMATE_SELECT} WHERE estimates.id = $1`, [estimateId])
  return result.rows[0] ?? null
}

export async function selectEstimateItemsByEstimateId(estimateId: string | number, db: Queryable = pool) {
  const result = await db.query(
    `SELECT id, position, name, description, quantity, unit, unit_price, amount
     FROM estimate_items WHERE estimate_id = $1 ORDER BY position, id`,
    [estimateId]
  )
  return result.rows
}

export async function selectOpenEstimates() {
  const result = await pool.query(
    `${ESTIMATE_SELECT} WHERE estimates.status <> 'approved' ORDER BY estimates.estimate_date DESC, estimates.id DESC`
  )
  return result.rows
}

export async function selectReuseText(field: string, search: string) {
  const result = await pool.query(
    `SELECT ${field} AS text, count(*)::int AS use_count, max(estimate_date) AS last_used
     FROM estimates
     WHERE ${field} IS NOT NULL AND trim(${field}) <> ''
     ${search ? `AND ${field} ILIKE '%' || $1 || '%'` : ''}
     GROUP BY ${field}
     ORDER BY max(estimate_date) DESC
     LIMIT 30`,
    search ? [search] : []
  )
  return result.rows
}

export async function selectAllEstimateNumbers(db: Queryable = pool) {
  const result = await db.query('SELECT estimate_number FROM estimates')
  return result.rows as { estimate_number: string }[]
}

export async function selectEstimateNumberTaken(number: string, db: Queryable = pool) {
  const result = await db.query('SELECT 1 FROM estimates WHERE lower(estimate_number) = lower($1)', [number])
  return result.rows.length > 0
}

export async function assertProjectExists(db: Queryable, projectId: unknown) {
  const project = await db.query('SELECT 1 FROM projects WHERE id = $1', [projectId])
  return project.rows.length > 0
}

export async function deleteEstimateItems(client: PoolClient, estimateId: string | number) {
  await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId])
}

export async function insertEstimateItem(
  client: PoolClient,
  estimateId: string | number,
  position: number,
  item: { name: string; description: string | null; quantity: number; unit: string; unit_price: number }
) {
  await client.query(
    `INSERT INTO estimate_items (estimate_id, position, name, description, quantity, unit, unit_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [estimateId, position, item.name, item.description, item.quantity, item.unit, item.unit_price]
  )
}

export async function updateEstimateTotals(
  client: PoolClient,
  estimateId: string | number,
  totals: { subtotal: number; discount: number; total: number }
) {
  await client.query('UPDATE estimates SET subtotal = $2, discount = $3, total = $4 WHERE id = $1', [
    estimateId,
    totals.subtotal,
    totals.discount,
    totals.total,
  ])
}

type EstimateHeader = {
  estimate_number: string
  title: string
  summary: string | null
  client_id: unknown
  contact_name: string | null
  customer_ref: string | null
  estimate_date: unknown
  valid_until: unknown
  currency: string
  status: string
  notes: string | null
  discount_type: unknown
  discount_value: unknown
  project_id: unknown
  payment_terms: string | null
  timeline: string | null
  exclusions: string | null
  project_location: string | null
  introduction: string | null
  pricing_method: unknown
  lump_sum_fee: unknown
  document_language: unknown
}

type ClientSnapshot = { client_name: string | null; client_email: string | null; client_phone: string | null; client_address: string | null }

export async function insertEstimate(client: PoolClient, header: EstimateHeader, snapshot: ClientSnapshot) {
  const inserted = await client.query(
    `INSERT INTO estimates (estimate_number, title, summary, client_id, contact_name, customer_ref, estimate_date,
                            valid_until, currency, status, notes, discount_type, discount_value, project_id,
                            payment_terms, timeline, exclusions, project_location, introduction,
                            pricing_method, lump_sum_fee, document_language,
                            client_name, client_email, client_phone, client_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
     RETURNING id`,
    [
      header.estimate_number, header.title, header.summary, header.client_id, header.contact_name, header.customer_ref,
      header.estimate_date, header.valid_until, header.currency, header.status, header.notes, header.discount_type,
      header.discount_value, header.project_id, header.payment_terms, header.timeline, header.exclusions,
      header.project_location, header.introduction, header.pricing_method, header.lump_sum_fee, header.document_language,
      snapshot.client_name, snapshot.client_email, snapshot.client_phone, snapshot.client_address,
    ]
  )
  return inserted.rows[0].id
}

export async function updateEstimate(client: PoolClient, id: string, header: EstimateHeader, snapshot: ClientSnapshot) {
  await client.query(
    `UPDATE estimates SET estimate_number = $2, title = $3, summary = $4, client_id = $5, contact_name = $6,
                          customer_ref = $7, estimate_date = $8, valid_until = $9, currency = $10, status = $11,
                          notes = $12, discount_type = $13, discount_value = $14, project_id = $15,
                          payment_terms = $16, timeline = $17, exclusions = $18, project_location = $19,
                          introduction = $20, pricing_method = $21, lump_sum_fee = $22, document_language = $23,
                          client_name = $24, client_email = $25, client_phone = $26, client_address = $27,
                          updated_at = now()
     WHERE id = $1`,
    [
      id, header.estimate_number, header.title, header.summary, header.client_id, header.contact_name, header.customer_ref,
      header.estimate_date, header.valid_until, header.currency, header.status, header.notes, header.discount_type,
      header.discount_value, header.project_id, header.payment_terms, header.timeline, header.exclusions,
      header.project_location, header.introduction, header.pricing_method, header.lump_sum_fee, header.document_language,
      snapshot.client_name, snapshot.client_email, snapshot.client_phone, snapshot.client_address,
    ]
  )
}

export async function selectCurrentEstimateForUpdate(client: PoolClient, id: string) {
  const result = await client.query(
    `SELECT status, client_id, client_name, client_email, client_phone, client_address
     FROM estimates WHERE id = $1 FOR UPDATE`,
    [id]
  )
  return result.rows[0] ?? null
}

// ---- approve ----

export async function lockEstimateForApproval(client: PoolClient, estimateId: string) {
  const result = await client.query('SELECT id, status FROM estimates WHERE id = $1 FOR UPDATE', [estimateId])
  return result.rows[0] ?? null
}

export async function selectInvoiceIdForEstimate(client: PoolClient, estimateId: string) {
  const result = await client.query('SELECT id FROM invoices WHERE estimate_id = $1', [estimateId])
  return result.rows[0] ?? null
}

export async function selectCurrentDate(client: PoolClient) {
  const result = await client.query("SELECT to_char(current_date, 'YYYY-MM-DD') AS d")
  return result.rows[0].d as string
}

export async function selectDatePlusDays(client: PoolClient, days: number) {
  const result = await client.query("SELECT to_char(current_date + $1::int, 'YYYY-MM-DD') AS d", [days])
  return result.rows[0].d as string
}

export async function selectNextInvoiceSequence(client: PoolClient) {
  const result = await client.query("SELECT nextval('invoice_number_seq') AS n")
  return result.rows[0].n
}

export async function insertInvoiceFromEstimate(
  client: PoolClient,
  estimateId: string,
  number: string,
  estimate: Record<string, unknown>,
  paymentTermDays: number
) {
  const result = await client.query(
    `INSERT INTO invoices (estimate_id, invoice_number, client_id, contact_name, title, summary, invoice_date, due_date,
                           currency, notes, subtotal, discount_type, discount_value, discount, total,
                           payment_terms, timeline, exclusions, project_location, introduction,
                           pricing_method, lump_sum_fee, document_language,
                           client_name, client_email, client_phone, client_address)
     VALUES ($1, $2, $3, $4, $5, $6, current_date, current_date + $7::int, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
             $20, $21, $22, $23, $24, $25, $26)
     RETURNING id`,
    [
      estimateId, number, estimate.client_id, estimate.contact_name, estimate.title, estimate.summary,
      paymentTermDays, estimate.currency, estimate.notes, estimate.subtotal, estimate.discount_type,
      estimate.discount_value, estimate.discount, estimate.total,
      estimate.payment_terms, estimate.timeline, estimate.exclusions,
      estimate.project_location, estimate.introduction,
      // The invoice inherits the estimate's own client snapshot; it never re-reads the Client master record
      estimate.pricing_method, estimate.lump_sum_fee, estimate.document_language,
      estimate.client_name, estimate.client_email, estimate.client_phone, estimate.client_address,
    ]
  )
  return result.rows[0] as { id: string }
}

// The invoice keeps its own copy of every line, so later changes never rewrite it
export async function copyEstimateItemsToInvoice(client: PoolClient, invoiceId: string, estimateId: string) {
  await client.query(
    `INSERT INTO invoice_items (invoice_id, position, name, description, quantity, unit, unit_price)
     SELECT $1, position, name, description, quantity, unit, unit_price FROM estimate_items WHERE estimate_id = $2`,
    [invoiceId, estimateId]
  )
}

export async function lockProjectForApproval(client: PoolClient, projectId: string) {
  const result = await client.query('SELECT id, source_estimate_id FROM projects WHERE id = $1 FOR UPDATE', [projectId])
  return result.rows[0] ?? null
}

export async function confirmExistingProjectForEstimate(
  client: PoolClient,
  projectId: string,
  total: unknown,
  estimateId: string,
  invoiceId: string,
  location: unknown
) {
  await client.query(
    `UPDATE projects SET fee_status = 'confirmed', total_fee = $2, source_estimate_id = $3, source_invoice_id = $4, location = $5 WHERE id = $1`,
    [projectId, total, estimateId, invoiceId, location]
  )
}

export async function insertProjectFromEstimate(
  client: PoolClient,
  estimate: Record<string, unknown>,
  estimateId: string,
  invoiceId: string
) {
  const created = await client.query(
    `INSERT INTO projects (client_id, name, description, total_fee, fee_status, start_date, status, source_estimate_id, source_invoice_id, location)
     VALUES ($1, $2, $3, $4, 'confirmed', current_date, 'planning', $5, $6, $7) RETURNING id`,
    [estimate.client_id, estimate.summary || estimate.title, estimate.summary, estimate.total, estimateId, invoiceId, estimate.project_location]
  )
  return created.rows[0].id as string
}

export async function markEstimateApproved(client: PoolClient, estimateId: string, projectId: string) {
  await client.query(`UPDATE estimates SET status = 'approved', approved_at = now(), project_id = $2, updated_at = now() WHERE id = $1`, [
    estimateId,
    projectId,
  ])
}

// ---- duplicate ----

export async function insertDuplicateEstimate(
  client: PoolClient,
  newNumber: string,
  source: Record<string, unknown>,
  today: string,
  validUntil: string | null
) {
  const inserted = await client.query(
    `INSERT INTO estimates (estimate_number, title, summary, client_id, contact_name, customer_ref, estimate_date,
                            valid_until, currency, status, notes, discount_type, discount_value,
                            payment_terms, timeline, exclusions, project_location, introduction,
                            pricing_method, lump_sum_fee, document_language,
                            client_name, client_email, client_phone, client_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
     RETURNING id`,
    [
      newNumber, source.title, source.summary, source.client_id, source.contact_name, source.customer_ref,
      today, validUntil, source.currency, source.notes, source.discount_type, source.discount_value,
      source.payment_terms, source.timeline, source.exclusions, source.project_location, source.introduction,
      source.pricing_method, source.lump_sum_fee, source.document_language,
      source.client_name, source.client_email, source.client_phone, source.client_address,
    ]
  )
  return inserted.rows[0].id
}

// ---- delete ----

export async function lockEstimateForDelete(client: PoolClient, id: string) {
  const result = await client.query('SELECT id FROM estimates WHERE id = $1 FOR UPDATE', [id])
  return result.rows[0] ?? null
}

export async function selectInvoiceNumberForEstimate(client: PoolClient, id: string) {
  const result = await client.query('SELECT invoice_number FROM invoices WHERE estimate_id = $1', [id])
  return result.rows[0] ?? null
}

export async function selectProjectNameForEstimate(client: PoolClient, id: string) {
  const result = await client.query('SELECT name FROM projects WHERE source_estimate_id = $1', [id])
  return result.rows[0] ?? null
}

export async function deleteEstimateById(client: PoolClient, id: string) {
  await client.query('DELETE FROM estimates WHERE id = $1', [id])
}
