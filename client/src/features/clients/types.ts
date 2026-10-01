export type Client = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
}

export type ClientForm = { name: string; contact_name: string; email: string; phone: string; address: string }
