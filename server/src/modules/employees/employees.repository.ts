import { pool } from '../../db'

export async function selectEmployees(organizationId: string) {
  const result = await pool.query(
    'SELECT id, full_name, position, monthly_salary, is_active, created_at FROM employees WHERE organization_id = $1 ORDER BY created_at DESC',
    [organizationId]
  )
  return result.rows
}

export async function insertEmployee(organizationId: string, data: { full_name: string; position: string; monthly_salary: number }) {
  const result = await pool.query(
    'INSERT INTO employees (organization_id, full_name, position, monthly_salary) VALUES ($1, $2, $3, $4) RETURNING id, full_name, position, monthly_salary, is_active, created_at',
    [organizationId, data.full_name, data.position, data.monthly_salary]
  )
  return result.rows[0]
}

export async function updateEmployee(
  organizationId: string,
  employeeId: string,
  data: { full_name: string; position: string; monthly_salary: number; is_active: boolean }
) {
  const result = await pool.query(
    `UPDATE employees SET full_name = $3, position = $4, monthly_salary = $5, is_active = $6
     WHERE id = $1 AND organization_id = $2
     RETURNING id, full_name, position, monthly_salary, is_active, created_at`,
    [employeeId, organizationId, data.full_name, data.position, data.monthly_salary, data.is_active]
  )
  return result.rows[0] ?? null
}
