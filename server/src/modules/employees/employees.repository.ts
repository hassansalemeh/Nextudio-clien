import { pool } from '../../db'

export async function selectEmployees() {
  const result = await pool.query(
    'SELECT id, full_name, position, monthly_salary, is_active, created_at FROM employees ORDER BY created_at DESC'
  )
  return result.rows
}

export async function insertEmployee(data: { full_name: string; position: string; monthly_salary: number }) {
  const result = await pool.query(
    'INSERT INTO employees (full_name, position, monthly_salary) VALUES ($1, $2, $3) RETURNING id, full_name, position, monthly_salary, is_active, created_at',
    [data.full_name, data.position, data.monthly_salary]
  )
  return result.rows[0]
}

export async function updateEmployee(
  employeeId: string,
  data: { full_name: string; position: string; monthly_salary: number; is_active: boolean }
) {
  const result = await pool.query(
    `UPDATE employees SET full_name = $2, position = $3, monthly_salary = $4, is_active = $5
     WHERE id = $1
     RETURNING id, full_name, position, monthly_salary, is_active, created_at`,
    [employeeId, data.full_name, data.position, data.monthly_salary, data.is_active]
  )
  return result.rows[0] ?? null
}
