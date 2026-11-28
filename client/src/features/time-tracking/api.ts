import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client'
import type { DayData } from '../../shared/lib/timeUtils'
import type { Editing, Employee } from './types'

export async function fetchEmployeesForReview(): Promise<Employee[]> {
  const response = await apiGet('/api/employees')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchEmployeeDay(employeeId: string, from: string, to: string): Promise<DayData> {
  const response = await apiGet(`/api/time/day?employee_id=${employeeId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  if (!response.ok) {
    throw new Error('Failed to load')
  }
  return response.json()
}

export async function saveTimeEdit(editing: Editing, start: string, end: string): Promise<void> {
  const response = await apiPatch(`/api/time/${editing.kind}/${editing.id}`, { start, end })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to save')
  }
}
export async function deleteTimeEntry(id: string): Promise<void> {
  const response = await apiDelete(`/api/time/entries/${id}`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to delete')
  }
}

export function fetchTimeStatus() {
  return apiGet('/api/time/status')
}

export function fetchOwnDay(from: string, to: string) {
  return apiGet(`/api/time/day?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
}

export function fetchWorkAssignmentsForDate(date: string) {
  return apiGet(`/api/work-assignments?date=${date}`)
}

// Admin reviewing a specific employee's calendar: assignments for THAT employee, not the admin's own.
export function fetchWorkAssignmentsForEmployeeDate(employeeId: string, date: string) {
  return apiGet(`/api/work-assignments?date=${date}&employee_id=${employeeId}`)
}

export function fetchActiveProjectNames() {
  return apiGet('/api/projects/active-names')
}

export function postTimeAction(path: string, body: Record<string, string> = {}) {
  return apiPost(`/api/time/${path}`, body)
}

type ManualTimeEntryInput = {
  project_id: string
  date: string
  start: string
  end: string
  day_start: string
  day_end: string
  description: string
}

export async function addManualTimeEntry(input: ManualTimeEntryInput): Promise<{ status?: string }> {
  const response = await apiPost('/api/time/manual', input)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || 'Could not add the work entry.')
  }
  return data
}

// Admin entering hours for an employee (e.g. a site worker, who never logs in to do this themselves) -
// same route as addManualTimeEntry, just with an explicit employee_id instead of the caller's own.
export async function addManualTimeEntryForEmployee(employeeId: string, input: ManualTimeEntryInput): Promise<{ status?: string }> {
  const response = await apiPost('/api/time/manual', { ...input, employee_id: employeeId })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || 'Could not add the work entry.')
  }
  return data
}
