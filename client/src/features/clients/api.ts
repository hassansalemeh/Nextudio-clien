import { apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { Client, ClientForm } from './types'

export async function fetchClients(): Promise<Client[]> {
  const response = await apiGet('/api/clients')
  if (!response.ok) {
    throw new Error('Failed to load clients')
  }
  return response.json()
}

export async function createClient(form: ClientForm): Promise<Client> {
  const response = await apiPost('/api/clients', form)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to create client')
  }
  return response.json()
}

export async function updateClient(id: string, form: ClientForm): Promise<Client> {
  const response = await apiPut(`/api/clients/${id}`, form)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not update client.')
  return body
}
