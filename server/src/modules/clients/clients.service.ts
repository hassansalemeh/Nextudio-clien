import type { PoolClient } from 'pg'
import { HttpError } from '../../shared'
import type { z } from 'zod'
import type { clientBody } from './clients.schemas'
import * as clientsRepository from './clients.repository'

export type ClientInput = z.infer<typeof clientBody>

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
