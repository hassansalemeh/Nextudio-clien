import type { z } from 'zod'
import type { createEmployeeBody, updateEmployeeBody } from './employees.schemas'
import * as employeesRepository from './employees.repository'

// contact_email is a separate, optional notification address - never the employee's login email, which
// isn't editable here.
export type CreateEmployeeInput = z.infer<typeof createEmployeeBody>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeBody>

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
