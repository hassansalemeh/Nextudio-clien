export type Project = {
  id: string
  name: string
}

export type Employee = {
  id: string
  full_name: string
}

export type Assignment = {
  id: string
  employee_id: string
  employee_name: string
  position: string
}

export type WorkAssignment = {
  id: string
  project_id: string
  employee_id: string
  employee_name: string
  start_date: string
  end_date: string
  description: string
}

export type WorkAssignmentEdit = { project_id: string; employee_id: string; start_date: string; end_date: string; description: string }
