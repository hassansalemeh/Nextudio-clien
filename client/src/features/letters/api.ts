import { apiDelete, apiGet, apiPost, apiPut } from '../../shared/api/client'
import type { Client, LetterListItem, Project } from './types'

export async function fetchLetters(): Promise<LetterListItem[]> {
  const response = await apiGet('/api/letters')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchNextLetterNumber(): Promise<{ letter_number: string }> {
  const response = await apiGet('/api/letters/next-number')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchClientsForLetters(): Promise<Client[]> {
  const response = await apiGet('/api/clients')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchProjectsForLetters(): Promise<Project[]> {
  const response = await apiGet('/api/projects')
  if (!response.ok) return Promise.reject()
  return response.json()
}

export async function fetchLetter(id: string): Promise<any> {
  const response = await apiGet(`/api/letters/${id}`)
  if (response.status === 404) throw new Error('Letter not found.')
  if (!response.ok) throw new Error('Could not load letter.')
  return response.json()
}

export async function saveLetter(id: string | undefined, isNew: boolean, input: unknown): Promise<any> {
  const response = isNew ? await apiPost('/api/letters', input) : await apiPut(`/api/letters/${id}`, input)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to save letter')
  }
  return response.json()
}

export async function deleteLetter(id: string): Promise<void> {
  const response = await apiDelete(`/api/letters/${id}`)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Failed to delete letter')
  }
}

export async function fetchLetterEmails(letterId: string) {
  const response = await apiGet(`/api/letters/${letterId}/emails`)
  if (!response.ok) return []
  return response.json()
}

export async function sendLetterEmail(
  letterId: string,
  input: { to: string; cc: string | null; subject: string; message: string; attach_pdf: boolean }
) {
  const response = await apiPost(`/api/letters/${letterId}/send-email`, input)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error || 'Could not send the email.')
  return body
}
