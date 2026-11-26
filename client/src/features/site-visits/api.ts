import { apiDelete, apiGet, apiPatch, apiPost } from '../../shared/api/client'
import type { CreateSiteVisitInput, SiteVisit, SiteVisitSummary, UpdateSiteVisitInput } from './types'

// An employee gets only their own visits; an admin gets the whole organization's for that month.
export async function fetchSiteVisits(month: string): Promise<SiteVisit[]> {
  const response = await apiGet(`/api/site-visits?month=${encodeURIComponent(month)}`)
  if (!response.ok) throw new Error('Could not load site visits.')
  return response.json()
}

export async function fetchSiteVisitsSummary(month: string): Promise<SiteVisitSummary> {
  const response = await apiGet(`/api/site-visits/summary?month=${encodeURIComponent(month)}`)
  if (!response.ok) throw new Error('Could not load the site visits summary.')
  return response.json()
}

export async function createSiteVisit(input: CreateSiteVisitInput): Promise<SiteVisit> {
  const response = await apiPost('/api/site-visits', input)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || 'Could not log the visit.')
  return data
}

export async function updateSiteVisit(id: string, input: UpdateSiteVisitInput): Promise<void> {
  const response = await apiPatch(`/api/site-visits/${id}`, input)
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'Could not update the visit.')
  }
}

export async function deleteSiteVisit(id: string): Promise<void> {
  const response = await apiDelete(`/api/site-visits/${id}`)
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || 'Could not delete the visit.')
  }
}
