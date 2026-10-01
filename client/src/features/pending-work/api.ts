import { apiGet, apiPost } from '../../shared/api/client'
import type { PendingEntry } from './types'

export async function fetchPendingWorkEntries(): Promise<PendingEntry[]> {
  const response = await apiGet('/api/pending-work-entries')
  if (!response.ok) throw new Error()
  return response.json()
}

export async function rejectPendingWorkEntry(id: string): Promise<void> {
  const response = await apiPost(`/api/pending-work-entries/${id}/reject`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Could not reject this request.')
  }
}

export async function approvePendingWorkEntry(
  id: string,
  input: { start_date: string; end_date: string; description: string }
): Promise<void> {
  const response = await apiPost(`/api/pending-work-entries/${id}/approve`, input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Could not approve this request.')
  }
}
