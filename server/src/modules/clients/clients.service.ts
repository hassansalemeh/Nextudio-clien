import type { PoolClient } from 'pg'
import { HttpError } from '../../shared'
import * as clientsRepository from './clients.repository'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type ClientInput = { name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null }

export function parseClientInput(body: Record<string, unknown>): ClientInput {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const contact_name = typeof body.contact_name === 'string' ? body.contact_name.trim() : null
  const email = typeof body.email === 'string' ? body.email.trim() : null
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null
  const address = typeof body.address === 'string' ? body.address.trim() : null

  if (!name) {
    throw new HttpError(400, 'Client name is required')
  }
  if (email && !EMAIL_RE.test(email)) {
    throw new HttpError(400, 'Enter a valid email address')
  }
  return { name, contact_name, email, phone, address }
}

export async function listClients(organizationId: string) {
  return clientsRepository.selectClients(organizationId)
}

export async function createClient(organizationId: string, input: ClientInput) {
  return clientsRepository.insertClient(organizationId, input)
}

export async function updateClient(organizationId: string, clientId: string, input: ClientInput) {
  return clientsRepository.updateClient(organizationId, clientId, input)
}

// A client's name/contact email/phone/address, frozen onto an estimate or invoice when the client is
// selected (or changed). Editing the master Client record afterward must never alter a document that
// already has its own snapshot - only new documents (or a document whose client selection changes) see it.
export type ClientSnapshot = { client_name: string | null; client_email: string | null; client_phone: string | null; client_address: string | null }
const EMPTY_CLIENT_SNAPSHOT: ClientSnapshot = { client_name: null, client_email: null, client_phone: null, client_address: null }

export async function loadClientSnapshot(db: { query: PoolClient['query'] }, organizationId: string, clientId: unknown): Promise<ClientSnapshot> {
  if (!clientId) return EMPTY_CLIENT_SNAPSHOT
  const row = await clientsRepository.selectClientSnapshotSource(db, organizationId, clientId)
  if (!row) throw new HttpError(400, 'Client does not exist')
  return { client_name: row.name, client_email: row.email, client_phone: row.phone, client_address: row.address }
}
