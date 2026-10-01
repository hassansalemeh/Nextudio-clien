import { apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { Employee } from './types'

export async function fetchEmployees(): Promise<Employee[]> {
  const response = await apiGet('/api/employees')
  if (!response.ok) {
    throw new Error('Failed to load employees')
  }
  return response.json()
}

export async function createEmployee(input: { full_name: string; position: string; monthly_salary: number }): Promise<Employee> {
  const response = await apiPost('/api/employees', input)
  if (!response.ok) {
    throw new Error('Failed to create employee')
  }
  return response.json()
}

export async function updateEmployee(
  id: string,
  input: { full_name: string; position: string; monthly_salary: number; is_active: boolean }
): Promise<Employee> {
  const response = await apiPut(`/api/employees/${id}`, input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to update employee')
  }
  return response.json()
}
