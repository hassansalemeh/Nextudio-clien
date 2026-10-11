export type Client = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
}

export type Project = {
  id: string
  name: string
}

export type ReceiptListItem = {
  id: string
  receipt_number: string
  receipt_date: string
  receiver_name: string
  amount: string
  currency: string
  issued_by_admin: string
}

export type ReceiptDetail = {
  id: string
  receipt_number: string
  receipt_date: string
  client_id: string | null
  project_id: string | null
  receiver_name: string
  receiver_email: string | null
  amount: string
  currency: string
  reason: string
  issued_by_admin: string
  document_language: string
}
