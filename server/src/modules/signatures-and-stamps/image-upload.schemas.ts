import { z } from 'zod'

const MIME_TYPES = ['image/png', 'image/jpeg'] as const
// The client resizes to at most 1200px per side before uploading, so this is a backstop against an
// unresized or otherwise oversized payload, not the normal case.
const MAX_BYTES = 2 * 1024 * 1024

// Shared PNG/JPEG, 2MB-max validation for a signer's signature and the organization's stamps.
// Accepts either a bare base64 payload or a full data URI (the client sends the latter).
export const imageUploadBody = z
  .object({
    mime_type: z.enum(MIME_TYPES, { error: 'The image must be PNG or JPEG' }),
    image_base64: z.string({ error: 'An image is required' }).min(1, 'An image is required'),
  })
  .transform((data, ctx) => {
    const raw = data.image_base64
    const base64 = raw.includes(',') && raw.trim().startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw
    const image = Buffer.from(base64, 'base64')
    if (image.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Invalid image data', path: ['image_base64'] })
      return z.NEVER
    }
    if (image.length > MAX_BYTES) {
      ctx.addIssue({ code: 'custom', message: 'The image must be 2 MB or smaller', path: ['image_base64'] })
      return z.NEVER
    }
    return { mimeType: data.mime_type, image }
  })
