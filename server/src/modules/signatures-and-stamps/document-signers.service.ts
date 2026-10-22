import { HttpError } from '../../shared'
import { parseImageUpload } from './image-upload'
import * as signersRepository from './document-signers.repository'

function toSignerDto(row: signersRepository.DocumentSignerRow) {
  return {
    id: row.id,
    display_name: row.display_name,
    is_active: row.is_active,
    updated_at: row.updated_at,
    data_uri: row.image && row.mime_type ? `data:${row.mime_type};base64,${row.image.toString('base64')}` : null,
  }
}

export async function listSigners(organizationId: string) {
  const rows = await signersRepository.selectSigners(organizationId)
  return rows.map(toSignerDto)
}

function parseDisplayName(body: Record<string, unknown>): string {
  const name = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  if (!name) throw new HttpError(400, "The signer's name is required")
  if (name.length > 100) throw new HttpError(400, 'The name is too long (100 characters at most)')
  return name
}

export async function createSigner(organizationId: string, body: Record<string, unknown>) {
  const displayName = parseDisplayName(body)
  if (await signersRepository.selectNameTaken(organizationId, displayName, null)) {
    throw new HttpError(400, 'A signer with that name already exists')
  }
  await signersRepository.insertSigner(organizationId, displayName)
}

// Renaming or deactivating a signer never touches any receipt already issued under their name - that
// name was snapshotted onto the receipt at the time (receipts.issued_by_admin / received_by_admin).
export async function updateSigner(organizationId: string, id: string, body: Record<string, unknown>) {
  const displayName = parseDisplayName(body)
  const isActive = body.is_active !== false
  if (await signersRepository.selectNameTaken(organizationId, displayName, id)) {
    throw new HttpError(400, 'A signer with that name already exists')
  }
  const updated = await signersRepository.updateSigner(organizationId, id, displayName, isActive)
  if (!updated) throw new HttpError(404, 'Signer not found')
}

export async function updateSignerImage(organizationId: string, id: string, body: Record<string, unknown>, updatedBy: string) {
  const { mimeType, image } = parseImageUpload(body)
  const updated = await signersRepository.updateSignerImage(organizationId, id, mimeType, image, updatedBy)
  if (!updated) throw new HttpError(404, 'Signer not found')
}

// The signature image a receipt's PDF embeds in its .sig-slot, or null if that signer never uploaded
// one (the slot then stays blank, same as before this feature existed).
export async function signerSignatureDataUri(organizationId: string, signerId: string): Promise<string | null> {
  const row = await signersRepository.selectSignerImage(organizationId, signerId)
  return row?.image && row.mime_type ? `data:${row.mime_type};base64,${row.image.toString('base64')}` : null
}
