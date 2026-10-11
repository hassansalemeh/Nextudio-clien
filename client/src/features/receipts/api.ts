import { apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { Client, Project, ReceiptListItem } from './types'

export async function fetchReceipts(): Promise<ReceiptListItem[]> {
  const response = await apiGet('/api/receipts')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchNextReceiptNumber(): Promise<{ receipt_number: string }> {
  const response = await apiGet('/api/receipts/next-number')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchClientsForReceipts(): Promise<Client[]> {
  const response = await apiGet('/api/clients')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchProjectsForReceipts(): Promise<Project[]> {
  const response = await apiGet('/api/projects')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchReceipt(id: string): Promise<any> {
  const response = await apiGet(`/api/receipts/${id}`)
  if (response.status === 404) throw new Error('Receipt not found.')
  if (!response.ok) throw new Error('Could not load receipt.')
  return response.json()
}

export async function saveReceipt(id: string | undefined, isNew: boolean, input: unknown): Promise<any> {
  const response = isNew ? await apiPost('/api/receipts', input) : await apiPut(`/api/receipts/${id}`, input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to save receipt')
  }
  return response.json()
}

export async function fetchReceiptEmails(receiptId: string) {
  const response = await apiGet(`/api/receipts/${receiptId}/emails`)
  if (!response.ok) return []
  return response.json()
}

export async function sendReceiptEmail(
  receiptId: string,
  input: { to: string; cc: string | null; subject: string; message: string; attach_pdf: boolean }
) {
  const response = await apiPost(`/api/receipts/${receiptId}/send-email`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not send the email.')
  return body
}
