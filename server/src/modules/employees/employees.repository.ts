import { pool } from '../../db'

export async function selectEmployees(organizationId: string) {
  const result = await pool.query(
    'SELECT id, full_name, position, kind, monthly_salary, hourly_rate, contact_email, is_active, created_at FROM employees WHERE organization_id = $1 ORDER BY created_at DESC',
    [organizationId]
  )
  return result.rows
}

export async function insertEmployee(
  organizationId: string,
  data: { full_name: string; position: string; kind: string; monthly_salary: number; hourly_rate: number | null; contact_email: string | null }
) {
  const result = await pool.query(
    `INSERT INTO employees (organization_id, full_name, position, kind, monthly_salary, hourly_rate, contact_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, full_name, position, kind, monthly_salary, hourly_rate, contact_email, is_active, created_at`,
    [organizationId, data.full_name, data.position, data.kind, data.monthly_salary, data.hourly_rate, data.contact_email]
  )
  return result.rows[0]
}

export async function updateEmployee(
  organizationId: string,
  employeeId: string,
  data: {
    full_name: string
    position: string
    kind: string
    monthly_salary: number
    hourly_rate: number | null
    contact_email: string | null
    is_active: boolean
  }
) {
  const result = await pool.query(
    `UPDATE employees SET full_name = $3, position = $4, kind = $5, monthly_salary = $6, hourly_rate = $7, contact_email = $8, is_active = $9
     WHERE id = $1 AND organization_id = $2
     RETURNING id, full_name, position, kind, monthly_salary, hourly_rate, contact_email, is_active, created_at`,
    [employeeId, organizationId, data.full_name, data.position, data.kind, data.monthly_salary, data.hourly_rate, data.contact_email, data.is_active]
  )
  return result.rows[0] ?? null
}
