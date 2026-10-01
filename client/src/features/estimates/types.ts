export type Client = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
}

// The full client record, as returned by POST /api/clients (used by the inline "+ New Client" dialog)
export type NewClient = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
}

export type Project = {
  id: string
  name: string
  source_estimate_id: string | null
}

export type ItemForm = {
  key: number
  name: string
  description: string
  quantity: string
  unit: string
  unit_price: string
}

export type EstimateListItem = {
  id: string
  estimate_number: string
  title: string
  summary: string | null
  client_name: string | null
  estimate_date: string
  currency: string
  status: string
  total: string
}

export type EstimateLinks = {
  invoice_id: string | null
  invoice_number: string | null
  project_id: string | null
  approved_at: string | null
}
