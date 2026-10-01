import { apiDelete, apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { Client, EstimateListItem, NewClient, Project } from './types'

export async function fetchEstimates(): Promise<EstimateListItem[]> {
  const response = await apiGet('/api/estimates')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchNextEstimateNumber(): Promise<{ estimate_number: string }> {
  const response = await apiGet('/api/estimates/next-number')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchClientsForEstimates(): Promise<Client[]> {
  const response = await apiGet('/api/clients')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchProjectsForEstimates(): Promise<Project[]> {
  const response = await apiGet('/api/projects')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchEstimate(id: string): Promise<any> {
  const response = await apiGet(`/api/estimates/${id}`)
  if (response.status === 404) throw new Error('Estimate not found.')
  if (!response.ok) throw new Error('Could not load estimate.')
  return response.json()
}

export async function saveEstimate(id: string | undefined, isNew: boolean, input: unknown): Promise<any> {
  const response = isNew ? await apiPost('/api/estimates', input) : await apiPut(`/api/estimates/${id}`, input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to save estimate')
  }
  return response.json()
}

export async function approveEstimate(id: string): Promise<any> {
  const response = await apiPost(`/api/estimates/${id}/approve`)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Failed to approve estimate')
  return body
}

export async function deleteEstimate(id: string): Promise<void> {
  const response = await apiDelete(`/api/estimates/${id}`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to delete estimate')
  }
}

export async function duplicateEstimate(id: string): Promise<any> {
  const response = await apiPost(`/api/estimates/${id}/duplicate`)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not duplicate the estimate.')
  return body
}

export async function createClient(form: { name: string; contact_name: string; email: string; phone: string; address: string }): Promise<NewClient> {
  const response = await apiPost('/api/clients', form)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Failed to create client')
  return body
}

export async function fetchEstimateEmails(estimateId: string) {
  const response = await apiGet(`/api/estimates/${estimateId}/emails`)
  if (!response.ok) return []
  return response.json()
}

export async function sendEstimateEmail(
  estimateId: string,
  input: { to: string; cc: string | null; subject: string; message: string; attach_pdf: boolean }
) {
  const response = await apiPost(`/api/estimates/${estimateId}/send-email`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not send the email.')
  return body
}
