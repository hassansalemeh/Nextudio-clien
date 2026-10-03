import type { PoolClient } from 'pg'
import { pool } from '../../db'

export async function selectProjects(organizationId: string) {
  const result = await pool.query(
    `SELECT projects.id, projects.client_id, clients.name AS client_name, projects.name,
            projects.description, projects.location, projects.total_fee, projects.fee_status, projects.source_estimate_id,
            to_char(projects.start_date, 'YYYY-MM-DD') AS start_date, projects.status,
            projects.created_at
     FROM projects
     JOIN clients ON clients.id = projects.client_id
     WHERE projects.organization_id = $1
     ORDER BY projects.created_at DESC`,
    [organizationId]
  )
  return result.rows
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
  const result = await pool.query(
    `SELECT projects.id, projects.client_id, clients.name AS client_name, projects.name,
            projects.description, projects.location, projects.total_fee, projects.fee_status, projects.source_estimate_id,
            to_char(projects.start_date, 'YYYY-MM-DD') AS start_date, projects.status
     FROM projects JOIN clients ON clients.id = projects.client_id
     WHERE projects.id = $1 AND projects.organization_id = $2`,
    [projectId, organizationId]
  )
  return result.rows[0] ?? null
}

// Everyone assigned to the project, given a task on it, or who recorded time on it. The project itself is
// already org-checked by the caller (selectProjectDetail), so these child tables are reached safely through it.
export async function selectProjectEmployees(projectId: string) {
  const result = await pool.query(
    `SELECT id, full_name, position, monthly_salary FROM employees
     WHERE id IN (
       SELECT employee_id FROM project_assignments WHERE project_id = $1 AND is_active = true
       UNION SELECT employee_id FROM work_assignments WHERE project_id = $1
       UNION SELECT employee_id FROM time_entries WHERE project_id = $1 AND status = 'approved'
     )
     ORDER BY full_name`,
    [projectId]
  )
  return result.rows
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

export async function selectProjectPayments(organizationId: string, projectId: string) {
  const result = await pool.query(
    `SELECT payments.id, to_char(payments.payment_date, 'YYYY-MM-DD') AS payment_date, payments.reason,
            payments.amount, payments.method, payments.invoice_id,
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
