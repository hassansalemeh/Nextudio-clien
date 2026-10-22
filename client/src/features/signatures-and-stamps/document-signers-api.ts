import { apiGet, apiPost, apiPut } from '../../shared/api/client'

export type DocumentSigner = {
  id: string
  display_name: string
  is_active: boolean
  updated_at: string
  data_uri: string | null
}

export async function fetchSigners(): Promise<DocumentSigner[]> {
  const response = await apiGet('/api/document-signers')
  if (!response.ok) throw new Error('Could not load signers.')
  return response.json()
}

export async function createSigner(displayName: string): Promise<DocumentSigner[]> {
  const response = await apiPost('/api/document-signers', { display_name: displayName })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not add the signer.')
  return body
}

export async function updateSigner(id: string, input: { display_name: string; is_active: boolean }): Promise<DocumentSigner[]> {
  const response = await apiPut(`/api/document-signers/${id}`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not update the signer.')
  return body
}

export async function updateSignerImage(id: string, input: { mime_type: string; image_base64: string }): Promise<DocumentSigner[]> {
  const response = await apiPut(`/api/document-signers/${id}/image`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not save the signature.')
  return body
}
