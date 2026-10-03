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

export async function selectEstimateHeaderById(organizationId: string, estimateId: string | number, db: Queryable = pool) {
  const result = await db.query(`${ESTIMATE_SELECT} WHERE estimates.id = $1 AND estimates.organization_id = $2`, [estimateId, organizationId])
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

export async function selectOpenEstimates(organizationId: string) {
  const result = await pool.query(
    `${ESTIMATE_SELECT} WHERE estimates.organization_id = $1 AND estimates.status <> 'approved' ORDER BY estimates.estimate_date DESC, estimates.id DESC`,
    [organizationId]
  )
  return result.rows
}

export async function selectReuseText(organizationId: string, field: string, search: string) {
  const result = await pool.query(
    `SELECT ${field} AS text, count(*)::int AS use_count, max(estimate_date) AS last_used
     FROM estimates
     WHERE organization_id = $1 AND ${field} IS NOT NULL AND trim(${field}) <> ''
     ${search ? `AND ${field} ILIKE '%' || $2 || '%'` : ''}
     GROUP BY ${field}
     ORDER BY max(estimate_date) DESC
     LIMIT 30`,
    search ? [organizationId, search] : [organizationId]
  )
  return result.rows
}

export async function selectAllEstimateNumbers(organizationId: string, db: Queryable = pool) {
  const result = await db.query('SELECT estimate_number FROM estimates WHERE organization_id = $1', [organizationId])
  return result.rows as { estimate_number: string }[]
}

export async function selectEstimateNumberTaken(organizationId: string, number: string, db: Queryable = pool) {
  const result = await db.query('SELECT 1 FROM estimates WHERE organization_id = $1 AND lower(estimate_number) = lower($2)', [organizationId, number])
  return result.rows.length > 0
}

export async function assertProjectExists(db: Queryable, organizationId: string, projectId: unknown) {
  const project = await db.query('SELECT 1 FROM projects WHERE id = $1 AND organization_id = $2', [projectId, organizationId])
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

export async function insertEstimate(client: PoolClient, organizationId: string, header: EstimateHeader, snapshot: ClientSnapshot) {
  const inserted = await client.query(
    `INSERT INTO estimates (organization_id, estimate_number, title, summary, client_id, contact_name, customer_ref, estimate_date,
                            valid_until, currency, status, notes, discount_type, discount_value, project_id,
                            payment_terms, timeline, exclusions, project_location, introduction,
                            pricing_method, lump_sum_fee, document_language,
                            client_name, client_email, client_phone, client_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
     RETURNING id`,
    [
      organizationId, header.estimate_number, header.title, header.summary, header.client_id, header.contact_name, header.customer_ref,
      header.estimate_date, header.valid_until, header.currency, header.status, header.notes, header.discount_type,
      header.discount_value, header.project_id, header.payment_terms, header.timeline, header.exclusions,
      header.project_location, header.introduction, header.pricing_method, header.lump_sum_fee, header.document_language,
      snapshot.client_name, snapshot.client_email, snapshot.client_phone, snapshot.client_address,
    ]
  )
  return inserted.rows[0].id
}

export async function updateEstimate(client: PoolClient, organizationId: string, id: string, header: EstimateHeader, snapshot: ClientSnapshot) {
  await client.query(
    `UPDATE estimates SET estimate_number = $3, title = $4, summary = $5, client_id = $6, contact_name = $7,
                          customer_ref = $8, estimate_date = $9, valid_until = $10, currency = $11, status = $12,
                          notes = $13, discount_type = $14, discount_value = $15, project_id = $16,
                          payment_terms = $17, timeline = $18, exclusions = $19, project_location = $20,
                          introduction = $21, pricing_method = $22, lump_sum_fee = $23, document_language = $24,
                          client_name = $25, client_email = $26, client_phone = $27, client_address = $28,
                          updated_at = now()
     WHERE id = $1 AND organization_id = $2`,
    [
      id, organizationId, header.estimate_number, header.title, header.summary, header.client_id, header.contact_name, header.customer_ref,
      header.estimate_date, header.valid_until, header.currency, header.status, header.notes, header.discount_type,
      header.discount_value, header.project_id, header.payment_terms, header.timeline, header.exclusions,
      header.project_location, header.introduction, header.pricing_method, header.lump_sum_fee, header.document_language,
      snapshot.client_name, snapshot.client_email, snapshot.client_phone, snapshot.client_address,
    ]
  )
}

export async function selectCurrentEstimateForUpdate(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query(
    `SELECT status, client_id, client_name, client_email, client_phone, client_address
     FROM estimates WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [id, organizationId]
  )
  return result.rows[0] ?? null
}

// ---- approve ----

export async function lockEstimateForApproval(client: PoolClient, organizationId: string, estimateId: string) {
  const result = await client.query('SELECT id, status FROM estimates WHERE id = $1 AND organization_id = $2 FOR UPDATE', [estimateId, organizationId])
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

// Per-company numbering: the highest trailing number already used by this company's PROFESSIONAL
// invoices, plus one. Filtered to invoice_type so this never mixes in Client Funds invoice numbers,
// which are a separate series (NEX-CF- vs NEX-INV-) with their own counter - see invoices.repository's
// selectClientFundsInvoiceNumbers for that series. Mirrors nextEstimateNumber() below - no shared,
// cross-company DB sequence to race on.
export async function selectInvoiceNumbers(organizationId: string, db: Queryable) {
  const result = await db.query(`SELECT invoice_number FROM invoices WHERE organization_id = $1 AND invoice_type = 'professional_services'`, [
    organizationId,
  ])
  return result.rows as { invoice_number: string }[]
}

export async function selectInvoiceNumberTaken(organizationId: string, number: string, db: Queryable) {
  const result = await db.query(
    `SELECT 1 FROM invoices WHERE organization_id = $1 AND invoice_type = 'professional_services' AND invoice_number = $2`,
    [organizationId, number]
  )
  return result.rows.length > 0
}

export async function insertInvoiceFromEstimate(
  client: PoolClient,
  organizationId: string,
  estimateId: string,
  number: string,
  estimate: Record<string, unknown>,
  paymentTermDays: number
) {
  const result = await client.query(
    `INSERT INTO invoices (organization_id, estimate_id, invoice_number, client_id, contact_name, title, summary, invoice_date, due_date,
                           currency, notes, subtotal, discount_type, discount_value, discount, total,
                           payment_terms, timeline, exclusions, project_location, introduction,
                           pricing_method, lump_sum_fee, document_language,
                           client_name, client_email, client_phone, client_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, current_date, current_date + $8::int, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
             $20, $21, $22, $23, $24, $25, $26, $27)
     RETURNING id`,
    [
      organizationId, estimateId, number, estimate.client_id, estimate.contact_name, estimate.title, estimate.summary,
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

export async function lockProjectForApproval(client: PoolClient, organizationId: string, projectId: string) {
  const result = await client.query('SELECT id, source_estimate_id FROM projects WHERE id = $1 AND organization_id = $2 FOR UPDATE', [
    projectId,
    organizationId,
  ])
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
  organizationId: string,
  estimate: Record<string, unknown>,
  estimateId: string,
  invoiceId: string
) {
  const created = await client.query(
    `INSERT INTO projects (organization_id, client_id, name, description, total_fee, fee_status, start_date, status, source_estimate_id, source_invoice_id, location)
     VALUES ($1, $2, $3, $4, $5, 'confirmed', current_date, 'planning', $6, $7, $8) RETURNING id`,
    [organizationId, estimate.client_id, estimate.summary || estimate.title, estimate.summary, estimate.total, estimateId, invoiceId, estimate.project_location]
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
  organizationId: string,
  newNumber: string,
  source: Record<string, unknown>,
  today: string,
  validUntil: string | null
) {
  const inserted = await client.query(
    `INSERT INTO estimates (organization_id, estimate_number, title, summary, client_id, contact_name, customer_ref, estimate_date,
                            valid_until, currency, status, notes, discount_type, discount_value,
                            payment_terms, timeline, exclusions, project_location, introduction,
                            pricing_method, lump_sum_fee, document_language,
                            client_name, client_email, client_phone, client_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
     RETURNING id`,
    [
      organizationId, newNumber, source.title, source.summary, source.client_id, source.contact_name, source.customer_ref,
      today, validUntil, source.currency, source.notes, source.discount_type, source.discount_value,
      source.payment_terms, source.timeline, source.exclusions, source.project_location, source.introduction,
      source.pricing_method, source.lump_sum_fee, source.document_language,
      source.client_name, source.client_email, source.client_phone, source.client_address,
    ]
  )
  return inserted.rows[0].id
}

// ---- delete ----

export async function lockEstimateForDelete(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query('SELECT id FROM estimates WHERE id = $1 AND organization_id = $2 FOR UPDATE', [id, organizationId])
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
