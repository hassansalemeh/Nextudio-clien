import { HttpError } from '../../shared'

const MIME_TYPES = ['image/png', 'image/jpeg']
// The client resizes to at most 1200px per side before uploading, so this is a backstop against an
// unresized or otherwise oversized payload, not the normal case.
const MAX_BYTES = 2 * 1024 * 1024

// Shared PNG/JPEG, 2MB-max validation for a signer's signature and the organization's stamps.
// Accepts either a bare base64 payload or a full data URI (the client sends the latter).
export function parseImageUpload(body: Record<string, unknown>): { mimeType: string; image: Buffer } {
  const mimeType = body.mime_type
  if (typeof mimeType !== 'string' || !MIME_TYPES.includes(mimeType)) {
    throw new HttpError(400, 'The image must be PNG or JPEG')
  }

  const raw = body.image_base64
  if (typeof raw !== 'string' || !raw) throw new HttpError(400, 'An image is required')
  const base64 = raw.includes(',') && raw.trim().startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw
  const image = Buffer.from(base64, 'base64')
  if (image.length === 0) throw new HttpError(400, 'Invalid image data')
  if (image.length > MAX_BYTES) throw new HttpError(400, 'The image must be 2 MB or smaller')

  return { mimeType, image }
}
