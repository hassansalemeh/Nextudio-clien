import type { PoolClient } from 'pg'
import { pool } from '../../db'

// Neither attendance nor time_entries carries its own organization_id, so every query here reaches them
// through employees (and, for time entries, projects), which do.

// ---- attendance / time status ----

export async function selectOpenAttendanceSession(organizationId: string, employeeId: string) {
  const result = await pool.query(
    `SELECT attendance.id, attendance.clock_in FROM attendance
     JOIN employees ON employees.id = attendance.employee_id AND employees.organization_id = $2
     WHERE attendance.employee_id = $1 AND attendance.clock_out IS NULL`,
    [employeeId, organizationId]
  )
  return result.rows[0] ?? null
}

export async function selectActiveTimeEntry(organizationId: string, employeeId: string) {
  const result = await pool.query(
    `SELECT time_entries.id, time_entries.project_id, projects.name AS project_name, time_entries.started_at
     FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id AND employees.organization_id = $2
     JOIN projects ON projects.id = time_entries.project_id
     WHERE time_entries.employee_id = $1 AND time_entries.ended_at IS NULL`,
    [employeeId, organizationId]
  )
  return result.rows[0] ?? null
}

export async function selectAttendanceSessionsInRange(organizationId: string, employeeId: string, from: string, to: string) {
  const result = await pool.query(
    `SELECT attendance.id, attendance.clock_in, attendance.clock_out FROM attendance
     JOIN employees ON employees.id = attendance.employee_id AND employees.organization_id = $4
     WHERE attendance.employee_id = $1 AND attendance.clock_in >= $2 AND attendance.clock_in < $3
     ORDER BY attendance.clock_in`,
    [employeeId, from, to, organizationId]
  )
  return result.rows
}

export async function selectTimeEntriesInRange(organizationId: string, employeeId: string, from: string, to: string) {
  const result = await pool.query(
    `SELECT time_entries.id, time_entries.project_id, projects.name AS project_name,
            time_entries.started_at, time_entries.ended_at, time_entries.description, time_entries.status
     FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id AND employees.organization_id = $4
     JOIN projects ON projects.id = time_entries.project_id
     WHERE time_entries.employee_id = $1 AND time_entries.started_at >= $2 AND time_entries.started_at < $3
     ORDER BY time_entries.started_at`,
    [employeeId, from, to, organizationId]
  )
  return result.rows
}

export async function selectActiveEmployee(organizationId: string, employeeId: string) {
  const result = await pool.query('SELECT id FROM employees WHERE id = $1 AND organization_id = $2 AND is_active = true', [employeeId, organizationId])
  return result.rows[0] ?? null
}

export async function insertAttendanceClockIn(employeeId: string) {
  await pool.query('INSERT INTO attendance (employee_id, clock_in) VALUES ($1, clock_timestamp())', [employeeId])
}

export async function lockOpenAttendanceSession(client: PoolClient, organizationId: string, employeeId: unknown) {
  const result = await client.query(
    `SELECT attendance.id FROM attendance
     JOIN employees ON employees.id = attendance.employee_id AND employees.organization_id = $2
     WHERE attendance.employee_id = $1 AND attendance.clock_out IS NULL FOR UPDATE OF attendance`,
    [employeeId, organizationId]
  )
  return result.rows[0] ?? null
}

export async function selectClockTimestamp(client: PoolClient) {
  const result = await client.query('SELECT clock_timestamp() AS now')
  return result.rows[0].now as Date
}

export async function selectDateWithinOneDayOfToday(client: PoolClient, date: string) {
  const result = await client.query(`SELECT abs($1::date - current_date) <= 1 AS ok`, [date])
  return result.rows[0].ok as boolean
}

export async function selectWorkAssignmentCoversDate(client: PoolClient, employeeId: unknown, projectId: unknown, date: string) {
  const result = await client.query(
    `SELECT 1 FROM work_assignments
     WHERE employee_id = $1 AND project_id = $2 AND start_date <= $3 AND end_date >= $3 LIMIT 1`,
    [employeeId, projectId, date]
  )
  return result.rows.length > 0
}

export async function selectActiveTimeEntryForUpdate(client: PoolClient, organizationId: string, employeeId: unknown) {
  const result = await client.query(
    `SELECT time_entries.id, time_entries.project_id FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id AND employees.organization_id = $2
     WHERE time_entries.employee_id = $1 AND time_entries.ended_at IS NULL`,
    [employeeId, organizationId]
  )
  return result.rows[0] ?? null
}

export async function updateTimeEntryEndedAtById(client: PoolClient, entryId: string, now: Date) {
  await client.query('UPDATE time_entries SET ended_at = $2 WHERE id = $1', [entryId, now])
}

export async function selectEmployeeSalary(client: PoolClient, organizationId: string, employeeId: unknown) {
  const result = await client.query('SELECT monthly_salary FROM employees WHERE id = $1 AND organization_id = $2', [employeeId, organizationId])
  return result.rows[0] ?? null
}

export async function insertTimeEntryStart(client: PoolClient, employeeId: unknown, projectId: unknown, now: Date, rate: number) {
  await client.query(
    'INSERT INTO time_entries (employee_id, project_id, started_at, hourly_rate_snapshot) VALUES ($1, $2, $3, $4)',
    [employeeId, projectId, now, rate]
  )
}

// Used by /time/stop: throws if nothing was actually running, so the caller must check the returned count
export async function stopActiveTimeEntry(client: PoolClient, organizationId: string, employeeId: unknown, now: Date) {
  const result = await client.query(
    `UPDATE time_entries SET ended_at = $2
     WHERE employee_id = $1 AND ended_at IS NULL
       AND employee_id IN (SELECT id FROM employees WHERE organization_id = $3)`,
    [employeeId, now, organizationId]
  )
  return result.rowCount ?? 0
}

// Used by /time/clock-out: unconditional - it's fine if no project timer was running
export async function updateActiveTimeEntryEndedAtTx(client: PoolClient, organizationId: string, employeeId: unknown, now: Date) {
  await client.query(
    `UPDATE time_entries SET ended_at = $2
     WHERE employee_id = $1 AND ended_at IS NULL
       AND employee_id IN (SELECT id FROM employees WHERE organization_id = $3)`,
    [employeeId, now, organizationId]
  )
}

export async function updateAttendanceClockOut(client: PoolClient, sessionId: string, now: Date) {
  await client.query('UPDATE attendance SET clock_out = $2 WHERE id = $1', [sessionId, now])
}

export async function selectProjectStatus(client: PoolClient, organizationId: string, projectId: unknown) {
  const result = await client.query(`SELECT status FROM projects WHERE id = $1 AND organization_id = $2`, [projectId, organizationId])
  return result.rows[0] ?? null
}

export async function selectOverlappingTimeEntry(client: PoolClient, organizationId: string, employeeId: unknown, startAt: Date, endAt: Date) {
  const result = await client.query(
    `SELECT time_entries.ended_at FROM time_entries
     JOIN employees ON employees.id = time_entries.employee_id AND employees.organization_id = $4
     WHERE time_entries.employee_id = $1 AND time_entries.status <> 'rejected'
       AND tstzrange(time_entries.started_at, time_entries.ended_at) && tstzrange($2, $3) LIMIT 1`,
    [employeeId, startAt, endAt, organizationId]
  )
  return result.rows[0] ?? null
}

export async function insertManualTimeEntry(
  client: PoolClient,
  employeeId: unknown,
  projectId: unknown,
  startAt: Date,
  endAt: Date,
  rate: number,
  description: string,
  status: 'approved' | 'pending'
) {
  await client.query(
    `INSERT INTO time_entries (employee_id, project_id, started_at, ended_at, hourly_rate_snapshot, description, source, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)`,
    [employeeId, projectId, startAt, endAt, rate, description, status]
  )
}

export async function updateTimeEntryTimes(organizationId: string, id: string, start: Date, end: Date | null) {
  const result = await pool.query(
    `UPDATE time_entries SET started_at = $2, ended_at = $3
     WHERE id = $1 AND employee_id IN (SELECT id FROM employees WHERE organization_id = $4)
     RETURNING id`,
    [id, start, end, organizationId]
  )
  return result.rowCount ?? 0
}

export async function updateAttendanceTimes(organizationId: string, id: string, start: Date, end: Date | null) {
  const result = await pool.query(
    `UPDATE attendance SET clock_in = $2, clock_out = $3
     WHERE id = $1 AND employee_id IN (SELECT id FROM employees WHERE organization_id = $4)
     RETURNING id`,
    [id, start, end, organizationId]
  )
  return result.rowCount ?? 0
}

// ---- legacy work_entries (v1 time tracking, left in place but unreachable from the UI) ----

export async function selectWorkEntries(projectId: unknown) {
  const result = await pool.query(
    `SELECT work_entries.id, work_entries.employee_id, employees.full_name AS employee_name,
            to_char(work_entries.work_date, 'YYYY-MM-DD') AS work_date,
            to_char(work_entries.start_time, 'HH24:MI') AS start_time,
            to_char(work_entries.end_time, 'HH24:MI') AS end_time,
            work_entries.hourly_rate_snapshot, work_entries.created_at
     FROM work_entries
     JOIN employees ON employees.id = work_entries.employee_id
     WHERE work_entries.project_id = $1
     ORDER BY work_entries.work_date DESC, work_entries.start_time DESC`,
    [projectId]
  )
  return result.rows
}

export async function selectProjectExistsForWorkEntry(organizationId: string, projectId: unknown) {
  const result = await pool.query('SELECT id FROM projects WHERE id = $1 AND organization_id = $2', [projectId, organizationId])
  return result.rows.length > 0
}

export async function selectEmployeeForWorkEntry(organizationId: string, employeeId: unknown) {
  const result = await pool.query('SELECT id, full_name, monthly_salary FROM employees WHERE id = $1 AND organization_id = $2', [employeeId, organizationId])
  return result.rows[0] ?? null
}

export async function selectActiveAssignmentForWorkEntry(projectId: unknown, employeeId: unknown) {
  const result = await pool.query(
    'SELECT id FROM project_assignments WHERE project_id = $1 AND employee_id = $2 AND is_active = true',
    [projectId, employeeId]
  )
  return result.rows[0] ?? null
}

export async function selectOverlappingWorkEntry(employeeId: unknown, workDate: string, startTime: string, endTime: string) {
  const result = await pool.query(
    `SELECT id FROM work_entries
     WHERE employee_id = $1 AND work_date = $2
       AND start_time < $4 AND end_time > $3
     LIMIT 1`,
    [employeeId, workDate, startTime, endTime]
  )
  return result.rows[0] ?? null
}

export async function insertWorkEntry(
  projectId: unknown,
  employeeId: unknown,
  workDate: string,
  startTime: string,
  endTime: string,
  hourlyRate: number
) {
  const result = await pool.query(
    `INSERT INTO work_entries (project_id, employee_id, work_date, start_time, end_time, hourly_rate_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, employee_id, to_char(work_date, 'YYYY-MM-DD') AS work_date,
               to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
               hourly_rate_snapshot, created_at`,
    [projectId, employeeId, workDate, startTime, endTime, hourlyRate]
  )
  return result.rows[0]
}
