import { apiGet, apiPatch, apiPost } from '../../shared/api/client'
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

export function fetchTimeStatus() {
  return apiGet('/api/time/status')
}

export function fetchOwnDay(from: string, to: string) {
  return apiGet(`/api/time/day?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
}

export function fetchWorkAssignmentsForDate(date: string) {
  return apiGet(`/api/work-assignments?date=${date}`)
}

export function fetchActiveProjectNames() {
  return apiGet('/api/projects/active-names')
}

export function postTimeAction(path: string, body: Record<string, string> = {}) {
  return apiPost(`/api/time/${path}`, body)
}

export async function addManualTimeEntry(input: {
  project_id: string
  date: string
  start: string
  end: string
  day_start: string
  day_end: string
  description: string
}): Promise<{ status?: string }> {
  const response = await apiPost('/api/time/manual', input)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || 'Could not add the work entry.')
  }
  return data
}
