import { apiGet } from '../../shared/api/client'
import { localDateString, monthRange } from '../../shared/lib/timeUtils'
import type { DayData } from '../../shared/lib/timeUtils'

// Adds "&employee_id=..." to a URL when an employee is given (admin view)
function withEmployee(url: string, employeeId?: string): string {
  if (!employeeId) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}employee_id=${encodeURIComponent(employeeId)}`
}

export async function fetchMonthEntries(year: number, month: number, employeeId?: string): Promise<DayData> {
  const { from, to } = monthRange(year, month)
  const url = `/api/time/day?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const response = await apiGet(withEmployee(url, employeeId))
  if (!response.ok) throw new Error("Could not load this month's work.")
  return response.json()
}

// The earliest work this employee has ever logged - used to tell "before they started" apart from "missed"
export async function fetchFirstActivityDate(employeeId?: string): Promise<string | null> {
  const response = await apiGet(withEmployee('/api/time/first-activity', employeeId))
  if (!response.ok) throw new Error('Could not load your work history.')
  const data: { date: string | null } = await response.json()
  return data.date ? localDateString(new Date(data.date)) : null
}