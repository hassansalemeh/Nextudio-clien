import { pool } from '../../db'

export async function selectProfessionalPaymentsReceivedTotal() {
  const result = await pool.query(
    `SELECT coalesce(sum(payments.amount), 0) AS total FROM payments
     LEFT JOIN invoices ON invoices.id = payments.invoice_id
     WHERE invoices.id IS NULL OR invoices.invoice_type = 'professional_services'`
  )
  return Number(result.rows[0].total)
}

export async function selectClientFundsPaymentsReceivedTotal() {
  const result = await pool.query(
    `SELECT coalesce(sum(payments.amount), 0) AS total FROM payments
     JOIN invoices ON invoices.id = payments.invoice_id
     WHERE invoices.invoice_type = 'client_funds'`
  )
  return Number(result.rows[0].total)
}

export async function selectRecentPayments() {
  const result = await pool.query(
    `SELECT payments.id, payments.project_id, projects.name AS project_name, clients.name AS client_name,
            to_char(payments.payment_date, 'YYYY-MM-DD') AS payment_date, payments.amount, payments.reason
     FROM payments JOIN projects ON projects.id = payments.project_id JOIN clients ON clients.id = projects.client_id
     ORDER BY payments.payment_date DESC, payments.id DESC LIMIT 5`
  )
  return result.rows
}

export async function selectClockedIn() {
  const result = await pool.query(
    `SELECT employees.full_name AS employee_name, attendance.clock_in
     FROM attendance JOIN employees ON employees.id = attendance.employee_id
     WHERE attendance.clock_out IS NULL ORDER BY attendance.clock_in`
  )
  return result.rows
}

export async function selectWorkingNow() {
  const result = await pool.query(
    `SELECT employees.full_name AS employee_name, projects.name AS project_name, time_entries.started_at
     FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id
     JOIN projects ON projects.id = time_entries.project_id
     WHERE time_entries.ended_at IS NULL AND time_entries.status = 'approved' ORDER BY time_entries.started_at`
  )
  return result.rows
}

export async function selectHoursToday(dayFrom: Date, dayTo: Date) {
  const result = await pool.query(
    `SELECT coalesce(sum(extract(epoch FROM (coalesce(ended_at, now()) - started_at))), 0) / 3600 AS hours
     FROM time_entries WHERE started_at >= $1 AND started_at < $2 AND status = 'approved'`,
    [dayFrom, dayTo]
  )
  return Number(result.rows[0].hours)
}
