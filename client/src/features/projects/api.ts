import { apiDelete, apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { Client, Project, ProjectDetails, SummaryRow } from './types'

export async function fetchProjects(): Promise<Project[]> {
  const response = await apiGet('/api/projects')
  if (!response.ok) {
    throw new Error('Failed to load projects')
  }
  return response.json()
}

export async function fetchClientsForProjects(): Promise<Client[]> {
  const response = await apiGet('/api/clients')
  if (!response.ok) {
    throw new Error('Failed to load clients')
  }
  return response.json()
}

export type ProjectInput = {
  client_id: string
  name: string
  description: string
  total_fee: number | null
  fee_status: string
  start_date: string | null
  status: string
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const response = await apiPost('/api/projects', input)
  if (!response.ok) {
    throw new Error('Failed to create project')
  }
  return response.json()
}

export async function updateProject(id: string, input: ProjectInput): Promise<Project> {
  const response = await apiPut(`/api/projects/${id}`, input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to update project')
  }
  return response.json()
}

export async function deleteProject(id: string): Promise<void> {
  const response = await apiDelete(`/api/projects/${id}`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to delete project')
  }
}

export async function fetchProjectDetails(id: string): Promise<ProjectDetails> {
  const response = await apiGet(`/api/projects/${id}`)
  if (response.status === 404) throw new Error('Project not found.')
  if (!response.ok) throw new Error('Could not load project.')
  return response.json()
}

export async function fetchProjectFinancialSummary(): Promise<SummaryRow[]> {
  const response = await apiGet('/api/project-financial-summary')
  if (!response.ok) throw new Error()
  return response.json()
}
