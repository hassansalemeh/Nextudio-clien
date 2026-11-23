import { z } from 'zod'
import { idString, text } from '../../shared'

export const signerIdParams = z.object({ signerId: idString('Signer id') })

const displayNameBody = z.object({ display_name: text("The signer's name", { max: 100 }) })

export const createSignerBody = displayNameBody

export const updateSignerBody = displayNameBody.extend({
  is_active: z.boolean({ error: 'is_active must be true or false' }).optional().default(true),
})
