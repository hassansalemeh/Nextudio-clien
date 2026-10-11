import { pool } from '../../db'

// day_off_requests has no organization_id of its own, so every query here reaches it through employees, which does.

export async function selectDayOffRequestsForEmployee(organizationId: string, employeeId: string) {
  const result = await pool.query(
    `SELECT day_off_requests.id, day_off_requests.employee_id, employees.full_name AS employee_name,
            to_char(day_off_requests.request_date, 'YYYY-MM-DD') AS request_date,
            day_off_requests.reason, day_off_requests.status, day_off_requests.reviewed_at, day_off_requests.created_at
     FROM day_off_requests
     JOIN employees ON employees.id = day_off_requests.employee_id AND employees.organization_id = $2
     WHERE day_off_requests.employee_id = $1
     ORDER BY day_off_requests.request_date DESC`,
    [employeeId, organizationId]
  )
  return result.rows
}

export async function selectAllDayOffRequests(organizationId: string) {
  const result = await pool.query(
    `SELECT day_off_requests.id, day_off_requests.employee_id, employees.full_name AS employee_name,
            to_char(day_off_requests.request_date, 'YYYY-MM-DD') AS request_date,
            day_off_requests.reason, day_off_requests.status, day_off_requests.reviewed_at, day_off_requests.created_at
     FROM day_off_requests
     JOIN employees ON employees.id = day_off_requests.employee_id AND employees.organization_id = $1
     ORDER BY (day_off_requests.status = 'pending') DESC, day_off_requests.request_date DESC`,
    [organizationId]
  )
  return result.rows
}

// An active (non-rejected) request already covering this date, if any - used to block a duplicate
export async function selectActiveRequestForDate(organizationId: string, employeeId: string, date: string) {
  const result = await pool.query(
    `SELECT day_off_requests.id FROM day_off_requests
     JOIN employees ON employees.id = day_off_requests.employee_id AND employees.organization_id = $3
     WHERE day_off_requests.employee_id = $1 AND day_off_requests.request_date = $2 AND day_off_requests.status <> 'rejected'`,
    [employeeId, date, organizationId]
  )
  return result.rows[0] ?? null
}

export async function insertDayOffRequest(employeeId: string, date: string, reason: string | null) {
  const result = await pool.query(
    `INSERT INTO day_off_requests (employee_id, request_date, reason)
     VALUES ($1, $2, $3)
     RETURNING id, employee_id, to_char(request_date, 'YYYY-MM-DD') AS request_date, reason, status, reviewed_at, created_at`,
    [employeeId, date, reason]
  )
  return result.rows[0]
}

// Only a still-pending request belonging to this employee can be cancelled; a real delete, not a status change
export async function deletePendingDayOffRequest(organizationId: string, employeeId: string, id: string) {
  const result = await pool.query(
    `DELETE FROM day_off_requests
     WHERE id = $1 AND employee_id = $2 AND status = 'pending'
       AND employee_id IN (SELECT id FROM employees WHERE organization_id = $3)`,
    [id, employeeId, organizationId]
  )
  return result.rowCount ?? 0
}

// Only a still-pending request can be approved or rejected; kept in history either way, never deleted
export async function reviewDayOffRequest(organizationId: string, id: string, status: 'approved' | 'rejected', reviewedBy: string) {
  const result = await pool.query(
    `UPDATE day_off_requests SET status = $2, reviewed_by = $3, reviewed_at = now()
     WHERE id = $1 AND status = 'pending'
       AND employee_id IN (SELECT id FROM employees WHERE organization_id = $4)
     RETURNING id`,
    [id, status, reviewedBy, organizationId]
  )
  return result.rowCount ?? 0
}
