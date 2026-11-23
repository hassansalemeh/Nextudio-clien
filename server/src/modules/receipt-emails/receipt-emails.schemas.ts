import { z } from 'zod'
import { emailList, idString, text } from '../../shared'

export const receiptIdParams = z.object({ receiptId: idString('Receipt id') })

export const sendReceiptEmailBody = z.object({
  to: emailList('Recipient email', { required: true }),
  cc: emailList('CC', { required: false }),
  subject: text('Subject', { max: 300 }),
  // Free text the admin typed into the email body - kept exactly as typed, blank is fine (the PDF attachment
  // can carry the whole message on its own).
  message: z.string({ error: 'Message must be text' }).max(10000, 'Message must be 10000 characters or fewer').optional().default(''),
  attach_pdf: z.boolean({ error: 'attach_pdf must be true or false' }).optional().default(true),
})
