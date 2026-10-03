import type { PoolClient } from 'pg'
import { pool } from '../../db'

// time_entries has no organization_id of its own, so every query here reaches it through employees, which does.

export async function selectPendingWorkEntries(organizationId: string) {
  const result = await pool.query(
    `SELECT time_entries.id, time_entries.employee_id, employees.full_name AS employee_name,
            time_entries.project_id, projects.name AS project_name,
            time_entries.started_at, time_entries.ended_at, time_entries.description, time_entries.status
     FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id AND employees.organization_id = $1
     JOIN projects ON projects.id = time_entries.project_id
     WHERE time_entries.status IN ('pending', 'rejected')
     ORDER BY (time_entries.status = 'pending') DESC, time_entries.started_at DESC`,
    [organizationId]
  )
  return result.rows
}

// kept in history as 'rejected', never deleted; only a still-pending request can be rejected
export async function rejectPendingWorkEntry(organizationId: string, id: string) {
  const result = await pool.query(
    `UPDATE time_entries SET status = 'rejected'
     WHERE id = $1 AND status = 'pending' AND employee_id IN (SELECT id FROM employees WHERE organization_id = $2)
     RETURNING id`,
    [id, organizationId]
  )
  return result.rowCount ?? 0
}

export async function selectWorkEntryForApproval(client: PoolClient, organizationId: string, id: string) {
  const result = await client.query(
    `SELECT time_entries.id, time_entries.employee_id, time_entries.project_id, time_entries.started_at,
            to_char(time_entries.started_at, 'YYYY-MM-DD') AS entry_date, time_entries.status
     FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id AND employees.organization_id = $2
     WHERE time_entries.id = $1 FOR UPDATE OF time_entries`,
    [id, organizationId]
  )
  return result.rows[0] ?? null
}

export async function selectAssignmentCoversDate(client: PoolClient, employeeId: unknown, projectId: unknown, date: string) {
  const result = await client.query(
    `SELECT 1 FROM work_assignments
     WHERE employee_id = $1 AND project_id = $2 AND start_date <= $3 AND end_date >= $3 LIMIT 1`,
    [employeeId, projectId, date]
  )
  return result.rows.length > 0
}

export async function insertWorkAssignmentForApproval(
  client: PoolClient,
  projectId: unknown,
  employeeId: unknown,
  startDate: string,
  endDate: string,
  description: string
) {
  await client.query(
    `INSERT INTO work_assignments (project_id, employee_id, start_date, end_date, description)
     VALUES ($1, $2, $3, $4, $5)`,
    [projectId, employeeId, startDate, endDate, description]
  )
}

export async function markTimeEntryApproved(client: PoolClient, id: string) {
  await client.query(`UPDATE time_entries SET status = 'approved' WHERE id = $1`, [id])
}
