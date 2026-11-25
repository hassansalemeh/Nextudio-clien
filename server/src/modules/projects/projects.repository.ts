import type { PoolClient } from 'pg'
import type { Prisma } from '../../generated/prisma/client'
import { pool, prisma } from '../../db'

// pg returns bigint/numeric/date columns as strings (never native bigint or Decimal, which
// res.json() can't serialize); Prisma returns native BigInt/Decimal/Date instead, so every
// Prisma-backed read below converts back to the same shape the hand-written SQL produced.
function bigintOrNull(value: bigint | null): string | null {
  return value === null ? null : value.toString()
}
function decimalOrNull(value: Prisma.Decimal | null): string | null {
  return value === null ? null : value.toString()
}
function decimalToString(value: Prisma.Decimal): string {
  return value.toString()
}
// `to_char(date, 'YYYY-MM-DD')` on a DATE column: pg parses DATE as a UTC-midnight Date for the
// stored calendar day, so slicing the ISO string reproduces the same text with no timezone math.
function dateOnly(value: Date | null): string | null {
  return value === null ? null : value.toISOString().slice(0, 10)
}

const PROJECT_LIST_SELECT = {
  id: true,
  client_id: true,
  name: true,
  description: true,
  location: true,
  total_fee: true,
  fee_status: true,
  source_estimate_id: true,
  start_date: true,
  status: true,
  clients_projects_client_idToclients: { select: { name: true } },
} satisfies Prisma.projectsSelect

function mapProjectRow(row: Prisma.projectsGetPayload<{ select: typeof PROJECT_LIST_SELECT }>) {
  return {
    id: row.id.toString(),
    client_id: row.client_id.toString(),
    client_name: row.clients_projects_client_idToclients.name,
    name: row.name,
    description: row.description,
    location: row.location,
    total_fee: decimalOrNull(row.total_fee),
    fee_status: row.fee_status,
    source_estimate_id: bigintOrNull(row.source_estimate_id),
    start_date: dateOnly(row.start_date),
    status: row.status,
  }
}

export async function selectProjects(organizationId: string) {
  const rows = await prisma.projects.findMany({
    where: { organization_id: BigInt(organizationId) },
    orderBy: { created_at: 'desc' },
    select: { ...PROJECT_LIST_SELECT, created_at: true },
  })
  return rows.map((row) => ({ ...mapProjectRow(row), created_at: row.created_at }))
}

// Employee-safe project list for "Add Work Manually": names only, no client, fee or financial data,
// and only projects that are actually open for new work.
export async function selectActiveProjectNames(organizationId: string) {
  const result = await pool.query(
    `SELECT id, name FROM projects WHERE organization_id = $1 AND status IN ('planning', 'in_progress') ORDER BY name`,
    [organizationId]
  )
  return result.rows
}

export async function insertProject(
  organizationId: string,
  data: {
    client_id: unknown
    name: string
    description: string | null
    total_fee: number | null
    fee_status: string
    start_date: string | null
    status: string
  }
) {
  const result = await pool.query(
    `INSERT INTO projects (organization_id, client_id, name, description, total_fee, fee_status, start_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, client_id, name, description, total_fee, fee_status,
               to_char(start_date, 'YYYY-MM-DD') AS start_date, status, created_at`,
    [organizationId, data.client_id, data.name, data.description, data.total_fee, data.fee_status, data.start_date, data.status]
  )
  return result.rows[0]
}

export async function selectClientName(organizationId: string, clientId: unknown) {
  const result = await pool.query('SELECT name FROM clients WHERE id = $1 AND organization_id = $2', [clientId, organizationId])
  return result.rows[0]?.name ?? null
}

export async function selectProjectDetail(organizationId: string, projectId: string) {
  const row = await prisma.projects.findFirst({
    where: { id: BigInt(projectId), organization_id: BigInt(organizationId) },
    select: PROJECT_LIST_SELECT,
  })
  return row ? mapProjectRow(row) : null
}

// Everyone assigned to the project, given a task on it, or who recorded time on it. The project itself is
// already org-checked by the caller (selectProjectDetail), so these child tables are reached safely through it.
//
// Kept as raw SQL (via prisma.$queryRaw, still through the same pool/adapter): a 3-way UNION of employee
// ids feeding an IN(), from three otherwise-unrelated tables, isn't something Prisma's query builder can
// express as one query - and a translation into three separate Prisma calls plus an in-JS merge would add
// round trips and risk of behavioral drift for no benefit over the proven SQL below.
export async function selectProjectEmployees(projectId: string) {
  const rows = await prisma.$queryRaw<
    { id: bigint; full_name: string; position: string; kind: string; monthly_salary: Prisma.Decimal; hourly_rate: Prisma.Decimal | null }[]
  >`SELECT id, full_name, position, kind, monthly_salary, hourly_rate FROM employees
     WHERE id IN (
       SELECT employee_id FROM project_assignments WHERE project_id = ${BigInt(projectId)} AND is_active = true
       UNION SELECT employee_id FROM work_assignments WHERE project_id = ${BigInt(projectId)}
       UNION SELECT employee_id FROM time_entries WHERE project_id = ${BigInt(projectId)} AND status = 'approved'
     )
     ORDER BY full_name`
  return rows.map((row) => ({
    id: row.id.toString(),
    full_name: row.full_name,
    position: row.position,
    kind: row.kind,
    monthly_salary: decimalToString(row.monthly_salary),
    hourly_rate: decimalOrNull(row.hourly_rate),
  }))
}

export async function selectProjectTasks(projectId: string) {
  const result = await pool.query(
    `SELECT employee_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date, description
     FROM work_assignments WHERE project_id = $1 ORDER BY start_date`,
    [projectId]
  )
  return result.rows
}

// Includes cancelled payments (greyed out client-side) so the history stays complete - callers that sum
// this list must filter payments.service's cancelled_at themselves, e.g. projects.service's paymentsReceived.
export async function selectProjectPayments(organizationId: string, projectId: string) {
  const result = await pool.query(
    `SELECT payments.id, to_char(payments.payment_date, 'YYYY-MM-DD') AS payment_date, payments.reason,
            payments.amount, payments.method, payments.invoice_id, payments.cancelled_at, payments.cancel_reason,
            coalesce(invoices.invoice_type, 'professional_services') AS invoice_type
     FROM payments LEFT JOIN invoices ON invoices.id = payments.invoice_id
     WHERE payments.project_id = $1 AND payments.organization_id = $2 ORDER BY payments.payment_date DESC, payments.id DESC`,
    [projectId, organizationId]
  )
  return result.rows
}

export async function selectDisbursementAmounts(invoiceIds: string[]) {
  if (invoiceIds.length === 0) return []
  const result = await pool.query('SELECT amount FROM invoice_disbursements WHERE invoice_id = ANY($1::bigint[])', [invoiceIds])
  return result.rows as { amount: string }[]
}

export async function updateProject(
  organizationId: string,
  projectId: string,
  data: {
    client_id: unknown
    name: string
    description: string | null
    total_fee: number | null
    fee_status: string
    start_date: string | null
    status: string
  }
) {
  const result = await pool.query(
    `UPDATE projects SET client_id = $3, name = $4, description = $5, total_fee = $6, fee_status = $7,
                          start_date = $8, status = $9
     WHERE id = $1 AND organization_id = $2
     RETURNING id, client_id, name, description, total_fee, fee_status,
               to_char(start_date, 'YYYY-MM-DD') AS start_date, status, created_at`,
    [projectId, organizationId, data.client_id, data.name, data.description, data.total_fee, data.fee_status, data.start_date, data.status]
  )
  return result.rows[0] ?? null
}

export async function lockProjectForDelete(client: PoolClient, organizationId: string, projectId: string) {
  const result = await client.query('SELECT id, source_invoice_id, source_estimate_id FROM projects WHERE id = $1 AND organization_id = $2 FOR UPDATE', [
    projectId,
    organizationId,
  ])
  return result.rows[0] ?? null
}

// Money records are never deleted silently: block the delete if the project has any
export async function selectFinancialRecordsForProject(client: PoolClient, projectId: string) {
  const result = await client.query(
    `SELECT 1 FROM money_movements
     WHERE project_id = $1
        OR location_id IN (SELECT id FROM money_locations WHERE project_id = $1)
        OR to_location_id IN (SELECT id FROM money_locations WHERE project_id = $1)
     UNION ALL
     SELECT 1 FROM supplier_agreements WHERE project_id = $1
     LIMIT 1`,
    [projectId]
  )
  return result.rows.length > 0
}

// A receipt (receipts.project_id, and its payment via receipts.payment_id) is RESTRICT, not CASCADE -
// deleting the project would otherwise fail on a raw foreign-key error instead of a clear message.
export async function selectReceiptsForProject(client: PoolClient, projectId: string) {
  const result = await client.query('SELECT 1 FROM receipts WHERE project_id = $1 LIMIT 1', [projectId])
  return result.rows.length > 0
}

export async function deletePaymentsForProject(client: PoolClient, projectId: string, invoiceId: string | null) {
  await client.query('DELETE FROM payments WHERE project_id = $1 OR ($2::bigint IS NOT NULL AND invoice_id = $2)', [projectId, invoiceId])
}

export async function deleteInvoiceById(client: PoolClient, invoiceId: string) {
  await client.query('DELETE FROM invoices WHERE id = $1', [invoiceId])
}

// Every table that references projects (all foreign keys are RESTRICT, so children go first)
const PROJECT_CHILD_TABLES = [
  'time_entries',
  'work_assignments',
  'project_assignments',
  'project_members',
  'project_service_types',
  'work_entries',
  'project_services',
  'money_locations',
]

export async function deleteProjectChildren(client: PoolClient, projectId: string) {
  for (const table of PROJECT_CHILD_TABLES) {
    await client.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId])
  }
}

export async function deleteProjectById(client: PoolClient, projectId: string) {
  await client.query('DELETE FROM projects WHERE id = $1', [projectId])
}

export async function deleteEstimateById(client: PoolClient, estimateId: string) {
  await client.query('DELETE FROM estimates WHERE id = $1', [estimateId])
}
