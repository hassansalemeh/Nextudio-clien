import { pool } from '../../db'

// ---- project_assignments: the roster of who is currently on a project ----

export async function selectActiveProjectAssignments(projectId: string) {
  const result = await pool.query(
    `SELECT project_assignments.id, project_assignments.employee_id,
            employees.full_name AS employee_name, employees.position
     FROM project_assignments
     JOIN employees ON employees.id = project_assignments.employee_id
     WHERE project_assignments.project_id = $1 AND project_assignments.is_active = true
     ORDER BY employees.full_name`,
    [projectId]
  )
  return result.rows
}

export async function selectProjectExists(projectId: string) {
  const result = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId])
  return result.rows.length > 0
}

export async function selectEmployeeExists(employeeId: unknown) {
  const result = await pool.query('SELECT id FROM employees WHERE id = $1', [employeeId])
  return result.rows.length > 0
}

export async function selectProjectAssignment(projectId: string, employeeId: unknown) {
  const result = await pool.query('SELECT id, is_active FROM project_assignments WHERE project_id = $1 AND employee_id = $2', [projectId, employeeId])
  return result.rows[0] ?? null
}

export async function reactivateProjectAssignment(assignmentId: string) {
  const result = await pool.query('UPDATE project_assignments SET is_active = true, assigned_at = now() WHERE id = $1 RETURNING id', [assignmentId])
  return result.rows[0].id
}

export async function insertProjectAssignment(projectId: string, employeeId: unknown) {
  const result = await pool.query('INSERT INTO project_assignments (project_id, employee_id) VALUES ($1, $2) RETURNING id', [projectId, employeeId])
  return result.rows[0].id
}

export async function selectProjectAssignmentById(assignmentId: string) {
  const result = await pool.query(
    `SELECT project_assignments.id, project_assignments.employee_id,
            employees.full_name AS employee_name, employees.position
     FROM project_assignments
     JOIN employees ON employees.id = project_assignments.employee_id
     WHERE project_assignments.id = $1`,
    [assignmentId]
  )
  return result.rows[0]
}

// ---- work_assignments: an admin-created task with a date range ----

export async function selectWorkAssignments(conditions: string[], params: string[]) {
  const result = await pool.query(
    `SELECT work_assignments.id, work_assignments.project_id, projects.name AS project_name,
            work_assignments.employee_id, employees.full_name AS employee_name,
            to_char(work_assignments.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(work_assignments.end_date, 'YYYY-MM-DD') AS end_date,
            work_assignments.description, work_assignments.created_at
     FROM work_assignments
     JOIN employees ON employees.id = work_assignments.employee_id
     JOIN projects ON projects.id = work_assignments.project_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY work_assignments.start_date DESC, work_assignments.created_at DESC`,
    params
  )
  return result.rows
}

export async function selectActiveAssignmentWithEmployeeName(projectId: unknown, employeeId: unknown) {
  const result = await pool.query(
    `SELECT employees.full_name
     FROM project_assignments
     JOIN employees ON employees.id = project_assignments.employee_id
     WHERE project_assignments.project_id = $1 AND project_assignments.employee_id = $2
       AND project_assignments.is_active = true`,
    [projectId, employeeId]
  )
  return result.rows[0] ?? null
}

export async function insertWorkAssignment(
  projectId: unknown,
  employeeId: unknown,
  startDate: string,
  endDate: string,
  description: string
) {
  const result = await pool.query(
    `INSERT INTO work_assignments (project_id, employee_id, start_date, end_date, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, employee_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date, 'YYYY-MM-DD') AS end_date, description, created_at`,
    [projectId, employeeId, startDate, endDate, description]
  )
  return result.rows[0]
}

export async function updateWorkAssignment(
  assignmentId: string,
  projectId: unknown,
  employeeId: unknown,
  startDate: string,
  endDate: string,
  description: string
) {
  const result = await pool.query(
    `UPDATE work_assignments
     SET project_id = $2, employee_id = $3, start_date = $4, end_date = $5, description = $6
     WHERE id = $1 RETURNING id`,
    [assignmentId, projectId, employeeId, startDate, endDate, description]
  )
  return result.rows[0] ?? null
}

export async function selectWorkAssignmentById(assignmentId: string) {
  const result = await pool.query(
    `SELECT work_assignments.id, work_assignments.project_id, projects.name AS project_name,
            work_assignments.employee_id, employees.full_name AS employee_name,
            to_char(work_assignments.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(work_assignments.end_date, 'YYYY-MM-DD') AS end_date,
            work_assignments.description, work_assignments.created_at
     FROM work_assignments
     JOIN employees ON employees.id = work_assignments.employee_id
     JOIN projects ON projects.id = work_assignments.project_id
     WHERE work_assignments.id = $1`,
    [assignmentId]
  )
  return result.rows[0]
}
