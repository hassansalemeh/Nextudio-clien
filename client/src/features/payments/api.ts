import { apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { InvoiceRow, Payment } from './types'

export async function fetchPaymentsAndInvoices(): Promise<{ payments: Payment[]; invoices: InvoiceRow[] }> {
  const [paymentsResponse, invoicesResponse] = await Promise.all([apiGet('/api/payments'), apiGet('/api/invoices')])
  if (!paymentsResponse.ok || !invoicesResponse.ok) throw new Error('Failed to load')
  const payments = await paymentsResponse.json()
  const invoices = await invoicesResponse.json()
  return { payments, invoices }
}

export function fetchProjectsForPayments() {
  return apiGet('/api/projects')
}

export type PaymentInput = {
  project_id: string
  invoice_id: string | null
  payment_date: string
  amount: number
  reason: string
  method: string | null
  reference: string
}

export async function savePayment(editingId: string | null, input: PaymentInput): Promise<Payment> {
  const response = editingId ? await apiPut(`/api/payments/${editingId}`, input) : await apiPost('/api/payments', input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not save the payment.')
  return body
}
