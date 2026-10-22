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
  payment_id: string | null
  cancelled_at: string | null
  cancel_reason: string | null
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
  // Text snapshots of each signer's name at the moment of this save - always set once a signer is chosen
  issued_by_admin: string
  received_by_admin: string | null
  issued_by_signer_id: string | null
  received_by_signer_id: string | null
  show_paid_stamp: boolean
  show_company_stamp: boolean
  document_language: string
  payment_id: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}
