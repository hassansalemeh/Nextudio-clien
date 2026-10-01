import { HttpError } from '../../shared'
import * as employeesRepository from './employees.repository'

export type CreateEmployeeInput = { full_name: string; position: string; monthly_salary: number }
export type UpdateEmployeeInput = CreateEmployeeInput & { is_active: boolean }

export function parseCreateEmployeeInput(body: Record<string, unknown>): CreateEmployeeInput {
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const position = typeof body.position === 'string' ? body.position.trim() : ''
  const monthly_salary = body.monthly_salary

  if (!full_name) throw new HttpError(400, 'full_name is required')
  if (!position) throw new HttpError(400, 'position is required')
  if (typeof monthly_salary !== 'number' || Number.isNaN(monthly_salary) || monthly_salary < 0) {
    throw new HttpError(400, 'monthly_salary must be a non-negative number')
  }
  return { full_name, position, monthly_salary }
}

export function parseUpdateEmployeeInput(body: Record<string, unknown>): UpdateEmployeeInput {
  const base = parseCreateEmployeeInput(body)
  const is_active = body.is_active
  if (typeof is_active !== 'boolean') throw new HttpError(400, 'is_active must be true or false')
  return { ...base, is_active }
}

export async function listEmployees() {
  return employeesRepository.selectEmployees()
}

export async function createEmployee(input: CreateEmployeeInput) {
  return employeesRepository.insertEmployee(input)
}

// Only the employees row changes: recorded time entries keep the hourly rate they were saved with
export async function updateEmployee(employeeId: string, input: UpdateEmployeeInput) {
  return employeesRepository.updateEmployee(employeeId, input)
}
