export type EmployeeKind = 'staff' | 'site_worker'

export type Employee = {
  id: string
  full_name: string
  position: string
  kind: EmployeeKind
  monthly_salary: string
  hourly_rate: string | null
  contact_email: string | null
  is_active: boolean
  created_at: string
}
