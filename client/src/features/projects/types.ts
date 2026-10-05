export type Project = {
  id: string
  client_id: string
  client_name: string
  name: string
  description: string | null
  total_fee: string | null
  fee_status: string
  start_date: string | null
  status: string
  created_at: string
}

export type Client = {
  id: string
  name: string
}

export type Assignment = { start_date: string; end_date: string; description: string }

export type ProjectDetails = {
  project: {
    id: string
    client_name: string
    name: string
    description: string | null
    location: string | null
    total_fee: string | null
    fee_status: string
    start_date: string | null
    status: string
  }
  employees: {
    employee_id: string
    full_name: string
    position: string
    assignments: Assignment[]
    hours_worked: number
    hourly_cost: number
    labor_cost: number
  }[]
  total_hours: number
  total_labor_cost: number
  confirmed_revenue: number
  current_position: number
  payments: { id: string; payment_date: string; reason: string; amount: string }[]
  payments_received: number
  client_balance_due: number
  client_funds: {
    invoices: { id: string; invoice_number: string; currency: string; total: number; paid: number; amount_due: number; status: string }[]
    invoiced: number
    received: number
    spent: number
    remaining: number
  }
}

export type SummaryRow = {
  project_id: string
  name: string
  fee_status: string
  entered_fee: number | null
  amount: number
  deducted: number
  remaining: number
}
