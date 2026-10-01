export const INVOICE_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
}

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  professional_services: 'Professional Services',
  client_funds: 'Client Funds',
}

export type InvoiceListItem = {
  id: string
  invoice_number: string
  invoice_type: string
  client_name: string
  project_id: string | null
  project_name: string | null
  currency: string
  total: string
  paid: number
  amount_due: number
  status: string
}

export type InvoiceDetail = {
  id: string
  invoice_number: string
  invoice_type: string
  client_name: string
  contact_name: string | null
  title: string
  summary: string | null
  invoice_date: string
  due_date: string | null
  currency: string
  notes: string | null
  payment_terms: string | null
  timeline: string | null
  exclusions: string | null
  project_location: string | null
  introduction: string | null
  document_language: string
  pricing_method: string
  contract_terms: string | null
  client_representative_name: string | null
  client_representative_title: string | null
  nextudio_representative_name: string | null
  nextudio_representative_title: string | null
  subtotal: string
  discount_type: string
  discount_value: string
  discount: string
  total: string
  estimate_id: string | null
  estimate_number: string | null
  project_id: string | null
  project_name: string | null
  client_email: string | null
  paid: number
  amount_due: number
  status: string
  items: { id: string; name: string; description: string | null; quantity: string; unit: string; unit_price: string; amount: string }[]
  payments: { id: string; payment_date: string; amount: string; reason: string; method: string | null; reference: string | null }[]
}

export type Disbursement = {
  id: string
  disbursement_date: string
  payee: string
  description: string | null
  category: string | null
  amount: string
  reference: string | null
}

export type ClientFundsClient = { id: string; name: string; contact_name: string | null; email: string | null }
export type ClientFundsProject = { id: string; client_id: string; name: string; location: string | null }

export type ClientFundsItemForm = {
  key: number
  name: string
  description: string
  quantity: string
  unit: string
  unit_price: string
}
