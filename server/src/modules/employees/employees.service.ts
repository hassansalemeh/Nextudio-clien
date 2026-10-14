import { HttpError } from '../../shared'
import * as employeesRepository from './employees.repository'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// contact_email is a separate, optional notification address - never the employee's login email, which
// isn't editable here.
export type CreateEmployeeInput = { full_name: string; position: string; monthly_salary: number; contact_email: string | null }
export type UpdateEmployeeInput = CreateEmployeeInput & { is_active: boolean }

export function parseCreateEmployeeInput(body: Record<string, unknown>): CreateEmployeeInput {
  const full_name = typeof body.full_name === 'string' ? body.full_name.trim() : ''
  const position = typeof body.position === 'string' ? body.position.trim() : ''
  const monthly_salary = body.monthly_salary
  const contact_email = typeof body.contact_email === 'string' ? body.contact_email.trim() : null

  if (!full_name) throw new HttpError(400, 'full_name is required')
  if (!position) throw new HttpError(400, 'position is required')
  if (typeof monthly_salary !== 'number' || Number.isNaN(monthly_salary) || monthly_salary < 0) {
    throw new HttpError(400, 'monthly_salary must be a non-negative number')
  }
  if (contact_email && !EMAIL_RE.test(contact_email)) {
    throw new HttpError(400, 'Enter a valid contact email address')
  }
  return { full_name, position, monthly_salary, contact_email: contact_email || null }
}

export function parseUpdateEmployeeInput(body: Record<string, unknown>): UpdateEmployeeInput {
  const base = parseCreateEmployeeInput(body)
  const is_active = body.is_active
  if (typeof is_active !== 'boolean') throw new HttpError(400, 'is_active must be true or false')
  return { ...base, is_active }
}

export async function listEmployees(organizationId: string) {
  return employeesRepository.selectEmployees(organizationId)
}

export async function createEmployee(organizationId: string, input: CreateEmployeeInput) {
  return employeesRepository.insertEmployee(organizationId, input)
}

// Only the employees row changes: recorded time entries keep the hourly rate they were saved with
export async function updateEmployee(organizationId: string, employeeId: string, input: UpdateEmployeeInput) {
  return employeesRepository.updateEmployee(organizationId, employeeId, input)
}
