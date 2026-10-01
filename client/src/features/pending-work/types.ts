export type PendingEntry = {
  id: string
  employee_id: string
  employee_name: string
  project_id: string
  project_name: string
  started_at: string
  ended_at: string
  description: string
  status: 'pending' | 'rejected'
}
