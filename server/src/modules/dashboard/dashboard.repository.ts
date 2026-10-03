import { pool } from '../../db'

export async function selectProfessionalPaymentsReceivedTotal(organizationId: string) {
  const result = await pool.query(
    `SELECT coalesce(sum(payments.amount), 0) AS total FROM payments
     LEFT JOIN invoices ON invoices.id = payments.invoice_id
     WHERE payments.organization_id = $1 AND (invoices.id IS NULL OR invoices.invoice_type = 'professional_services')`,
    [organizationId]
  )
  return Number(result.rows[0].total)
}

export async function selectClientFundsPaymentsReceivedTotal(organizationId: string) {
  const result = await pool.query(
    `SELECT coalesce(sum(payments.amount), 0) AS total FROM payments
     JOIN invoices ON invoices.id = payments.invoice_id
     WHERE payments.organization_id = $1 AND invoices.invoice_type = 'client_funds'`,
    [organizationId]
  )
  return Number(result.rows[0].total)
}

export async function selectRecentPayments(organizationId: string) {
  const result = await pool.query(
    `SELECT payments.id, payments.project_id, projects.name AS project_name, clients.name AS client_name,
            to_char(payments.payment_date, 'YYYY-MM-DD') AS payment_date, payments.amount, payments.reason
     FROM payments JOIN projects ON projects.id = payments.project_id JOIN clients ON clients.id = projects.client_id
     WHERE payments.organization_id = $1
     ORDER BY payments.payment_date DESC, payments.id DESC LIMIT 5`,
    [organizationId]
  )
  return result.rows
}

// attendance and time_entries have no organization_id of their own, so both are reached through employees, which does.

export async function selectClockedIn(organizationId: string) {
  const result = await pool.query(
    `SELECT employees.full_name AS employee_name, attendance.clock_in
     FROM attendance JOIN employees ON employees.id = attendance.employee_id
     WHERE employees.organization_id = $1 AND attendance.clock_out IS NULL ORDER BY attendance.clock_in`,
    [organizationId]
  )
  return result.rows
}

export async function selectWorkingNow(organizationId: string) {
  const result = await pool.query(
    `SELECT employees.full_name AS employee_name, projects.name AS project_name, time_entries.started_at
     FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id
     JOIN projects ON projects.id = time_entries.project_id
     WHERE employees.organization_id = $1 AND time_entries.ended_at IS NULL AND time_entries.status = 'approved'
     ORDER BY time_entries.started_at`,
    [organizationId]
  )
  return result.rows
}

export async function selectHoursToday(organizationId: string, dayFrom: Date, dayTo: Date) {
  const result = await pool.query(
    `SELECT coalesce(sum(extract(epoch FROM (coalesce(time_entries.ended_at, now()) - time_entries.started_at))), 0) / 3600 AS hours
     FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id
     WHERE employees.organization_id = $1 AND time_entries.started_at >= $2 AND time_entries.started_at < $3 AND time_entries.status = 'approved'`,
    [organizationId, dayFrom, dayTo]
  )
  return Number(result.rows[0].hours)
}
