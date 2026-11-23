import { z } from 'zod'
import { ADMIN_SIGNERS } from '../../config'
import { DOCUMENT_LANGUAGES } from '../../shared/i18n/documentLabels'
import { idString, isoDate, optionalIdString, optionalLongText, optionalText, text } from '../../shared'

export const letterIdParams = z.object({ letterId: idString('Letter id') })

// letter_number is optional here: a POST with none asks the caller for an auto-generated one (see
// letters.routes), so "required" for that case is enforced where the auto-number decision is made. PUT
// (update) requires one explicitly - see updateLetterBody.
export const letterHeaderShape = z.object({
  letter_number: optionalText('Letter number', { max: 100 }),
  letter_date: isoDate('Letter date'),
  client_id: optionalIdString('client_id'),
  project_id: optionalIdString('project_id'),
  recipient_name: text('Recipient', { max: 300 }),
  subject: text('Subject', { max: 300 }),
  // Letters keep their body's own line breaks exactly as typed - blank lines separate paragraphs, lines
  // starting with "- "/"* " become a bullet list (see documents.layout.ts's formatBody).
  body: optionalLongText('Body').refine((value) => value !== null, { message: 'Body is required' }),
  issued_by_admin: z
    .string({ error: `Issuing admin must be one of: ${ADMIN_SIGNERS.join(', ')}` })
    .trim()
    .refine((value) => ADMIN_SIGNERS.includes(value), { message: `Issuing admin must be one of: ${ADMIN_SIGNERS.join(', ')}` }),
  document_language: z.enum(DOCUMENT_LANGUAGES, { error: `Document language must be one of: ${DOCUMENT_LANGUAGES.join(', ')}` }).optional().default('en'),
})

export const createLetterBody = letterHeaderShape

export const updateLetterBody = letterHeaderShape.refine((data) => data.letter_number !== null, {
  message: 'Letter number is required',
  path: ['letter_number'],
})
