import { apiDelete, apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { ClientFundsClient, ClientFundsProject, Disbursement, InvoiceDetail, InvoiceListItem } from './types'

export async function fetchInvoices(): Promise<InvoiceListItem[]> {
  const response = await apiGet('/api/invoices')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchInvoice(id: string): Promise<InvoiceDetail> {
  const response = await apiGet(`/api/invoices/${id}`)
  if (response.status === 404) throw new Error('Invoice not found.')
  if (!response.ok) throw new Error('Could not load invoice.')
  return response.json()
}

export async function fetchInvoiceEmails(invoiceId: string) {
  const response = await apiGet(`/api/invoices/${invoiceId}/emails`)
  if (!response.ok) return []
  return response.json()
}

export async function sendInvoiceEmail(
  invoiceId: string,
  input: { to: string; cc: string | null; subject: string; message: string; attach_pdf: boolean }
) {
  const response = await apiPost(`/api/invoices/${invoiceId}/send-email`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not send the email.')
  return body
}

export async function fetchInvoiceDisbursements(id: string): Promise<Disbursement[]> {
  const response = await apiGet(`/api/invoices/${id}/disbursements`)
  if (!response.ok) return []
  return response.json()
}

export async function recordInvoicePayment(input: {
  project_id: string
  invoice_id: string
  payment_date: string
  amount: number
  reason: string
  method: string | null
  reference: string
}): Promise<void> {
  const response = await apiPost('/api/payments', input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not record the payment.')
}

export async function addInvoiceDisbursement(
  invoiceId: string,
  input: { disbursement_date: string; payee: string; description: string | null; category: string | null; amount: number; reference: string | null }
): Promise<void> {
  const response = await apiPost(`/api/invoices/${invoiceId}/disbursements`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not record the disbursement.')
}

export async function deleteInvoiceDisbursement(invoiceId: string, disbursementId: string): Promise<void> {
  const response = await apiDelete(`/api/invoices/${invoiceId}/disbursements/${disbursementId}`)
  if (!response.ok && response.status !== 204) throw new Error()
}

export async function saveInvoiceContract(
  invoiceId: string,
  input: {
    contract_terms: string
    client_representative_name: string
    client_representative_title: string
    nextudio_representative_name: string
    nextudio_representative_title: string
  }
): Promise<InvoiceDetail> {
  const response = await apiPut(`/api/invoices/${invoiceId}/contract`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not save the contract.')
  return body
}

export async function fetchNextClientFundsInvoiceNumber(): Promise<{ invoice_number: string }> {
  const response = await apiGet('/api/invoices/next-number?type=client_funds')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchClientsForInvoices(): Promise<ClientFundsClient[]> {
  const response = await apiGet('/api/clients')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchProjectsForInvoices(): Promise<ClientFundsProject[]> {
  const response = await apiGet('/api/projects')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function saveClientFundsInvoice(id: string | undefined, isNew: boolean, input: unknown): Promise<any> {
  const response = isNew ? await apiPost('/api/invoices', input) : await apiPut(`/api/invoices/${id}`, input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to save the invoice')
  }
  return response.json()
}
