import { apiGet } from '../../shared/api/client'
import { localDateString, monthRange } from '../../shared/lib/timeUtils'
import type { DayData } from '../../shared/lib/timeUtils'

export async function fetchMonthEntries(year: number, month: number): Promise<DayData> {
  const { from, to } = monthRange(year, month)
  const response = await apiGet(`/api/time/day?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  if (!response.ok) throw new Error("Could not load this month's work.")
  return response.json()
}

// The earliest work this employee has ever logged - used to tell "before they started" apart from "missed"
export async function fetchFirstActivityDate(): Promise<string | null> {
  const response = await apiGet('/api/time/first-activity')
  if (!response.ok) throw new Error('Could not load your work history.')
  const data: { date: string | null } = await response.json()
  return data.date ? localDateString(new Date(data.date)) : null
}
