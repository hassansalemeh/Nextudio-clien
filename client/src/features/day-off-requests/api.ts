import { apiGet, apiPost } from '../../shared/api/client'
import type { CreatedDayOffRequest, DayOffRequest } from './types'

// An employee gets only their own requests; an admin gets the whole organization's - the server decides which
export async function fetchDayOffRequests(): Promise<DayOffRequest[]> {
  const response = await apiGet('/api/day-off-requests')
  if (!response.ok) throw new Error('Could not load day-off requests.')
  return response.json()
}

export async function createDayOffRequest(date: string, reason: string): Promise<CreatedDayOffRequest> {
  const response = await apiPost('/api/day-off-requests', { date, reason })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Could not submit the request.')
  return data
}

export async function cancelDayOffRequest(id: string): Promise<void> {
  const response = await apiPost('/api/day-off-requests/cancel', { id })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'Could not cancel the request.')
  }
}

export async function approveDayOffRequest(id: string): Promise<void> {
  const response = await apiPost(`/api/day-off-requests/${id}/approve`)
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'Could not approve the request.')
  }
}

export async function rejectDayOffRequest(id: string): Promise<void> {
  const response = await apiPost(`/api/day-off-requests/${id}/reject`)
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'Could not reject the request.')
  }
}
