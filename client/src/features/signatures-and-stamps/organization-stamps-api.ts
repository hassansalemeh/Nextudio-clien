import { apiGet, apiPut } from '../../shared/api/client'

export type StampKind = 'paid_stamp' | 'company_stamp'

export type OrganizationStamp = {
  kind: StampKind
  updated_at: string | null
  data_uri: string | null
}

export async function fetchStamps(): Promise<OrganizationStamp[]> {
  const response = await apiGet('/api/organization-stamps')
  if (!response.ok) throw new Error('Could not load stamps.')
  return response.json()
}

export async function updateStamp(kind: StampKind, input: { mime_type: string; image_base64: string }): Promise<OrganizationStamp[]> {
  const response = await apiPut(`/api/organization-stamps/${kind}`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not save the stamp.')
  return body
}
