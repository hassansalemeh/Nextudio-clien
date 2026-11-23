import type { z } from 'zod'
import { lockForNumbering, withTransaction } from '../../db'
import type { imageUploadBody } from './image-upload.schemas'
import * as stampsRepository from './organization-stamps.repository'
import type { StampKind } from './organization-stamps.repository'

const KINDS: StampKind[] = ['paid_stamp', 'company_stamp']

export async function listStamps(organizationId: string) {
  const rows = await stampsRepository.selectStamps(organizationId)
  return KINDS.map((kind) => {
    const row = rows.find((r) => r.kind === kind)
    return {
      kind,
      updated_at: row?.updated_at ?? null,
      data_uri: row?.image && row.mime_type ? `data:${row.mime_type};base64,${row.image.toString('base64')}` : null,
    }
  })
}

export async function saveStamp(organizationId: string, kind: StampKind, upload: z.infer<typeof imageUploadBody>, updatedBy: string) {
  const { mimeType, image } = upload
  await withTransaction(async (client) => {
    // Serializes "check if a row exists, then update or insert" per (org, kind) - closes the race two
    // concurrent uploads of the same stamp could otherwise hit. Same pattern as receipt numbering.
    await lockForNumbering(client, organizationId, `organization_stamp:${kind}`)
    const existing = await stampsRepository.lockExistingStamp(client, organizationId, kind)
    if (existing) {
      await stampsRepository.updateStamp(client, existing.id, mimeType, image, updatedBy)
    } else {
      await stampsRepository.insertStamp(client, organizationId, kind, mimeType, image, updatedBy)
    }
  })
}

// The stamp image a receipt's PDF embeds, or null if the organization never uploaded one (today's
// behavior: that spot is simply left out).
export async function stampDataUri(organizationId: string, kind: StampKind): Promise<string | null> {
  const row = await stampsRepository.selectStampImage(organizationId, kind)
  return row?.image && row.mime_type ? `data:${row.mime_type};base64,${row.image.toString('base64')}` : null
}
