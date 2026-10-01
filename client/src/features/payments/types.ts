export type Project = { id: string; name: string }
export type InvoiceRow = { id: string; invoice_number: string; invoice_type: string; project_id: string | null; amount_due: number }
export type Payment = {
  id: string
  project_id: string
  project_name: string
  client_name: string
  invoice_id: string | null
  invoice_number: string | null
  payment_date: string
  amount: string
  reason: string
  method: string | null
  reference: string | null
  edits: number
}
