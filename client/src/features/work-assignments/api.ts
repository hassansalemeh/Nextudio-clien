import { apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { Assignment, Employee, Project, WorkAssignment, WorkAssignmentEdit } from './types'

export async function fetchProjects(): Promise<Project[]> {
  const response = await apiGet('/api/projects')
  if (!response.ok) throw new Error('Failed to load projects')
  return response.json()
}

export async function fetchAllEmployees(): Promise<Employee[]> {
  const response = await apiGet('/api/employees')
  if (!response.ok) throw new Error('Failed to load employees')
  return response.json()
}

export async function fetchProjectAssignments(projectId: string): Promise<Assignment[]> {
  const response = await apiGet(`/api/projects/${projectId}/assignments`)
  if (!response.ok) throw new Error('Failed to load assignments')
  return response.json()
}

export async function fetchWorkAssignments(projectId: string): Promise<WorkAssignment[]> {
  const response = await apiGet(`/api/work-assignments?project_id=${projectId}`)
  if (!response.ok) throw new Error('Failed to load work assignments')
  return response.json()
}

export async function assignEmployeeToProject(projectId: string, employeeId: string): Promise<Assignment> {
  const response = await apiPost(`/api/projects/${projectId}/assignments`, { employee_id: employeeId })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to assign employee')
  }
  return response.json()
}

export async function createWorkAssignment(input: {
  project_id: string
  employee_id: string
  start_date: string
  end_date: string
  description: string
}): Promise<WorkAssignment> {
  const response = await apiPost('/api/work-assignments', input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to assign work')
  }
  return response.json()
}

export async function updateWorkAssignment(id: string, input: WorkAssignmentEdit): Promise<WorkAssignment> {
  const response = await apiPut(`/api/work-assignments/${id}`, input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to update assignment')
  }
  return response.json()
}
