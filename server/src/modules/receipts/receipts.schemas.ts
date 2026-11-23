import { z } from 'zod'
import { DOCUMENT_LANGUAGES } from '../../shared/i18n/documentLabels'
import { idString, isoDate, optionalEmail, optionalIdString, optionalText, text } from '../../shared'

export const receiptIdParams = z.object({ receiptId: idString('Receipt id') })

// receipt_number is optional here: a POST with none asks the caller for an auto-generated one (see
// receipts.routes), so "required" for that case is enforced where the auto-number decision is made. PUT
// (update) requires one explicitly - see updateReceiptBody.
//
// project_id is likewise optional at this shape level: it's required when creating a brand-new receipt that
// is NOT linking to an existing payment, but stays optional for the one grandfathered receipt that predates
// payment-linking - that distinction is a real business rule, so it's checked in receipts.service, not here.
const receiptCoreBody = z.object({
  receipt_number: optionalText('Receipt number', { max: 100 }),
  receipt_date: isoDate('Receipt date'),
  client_id: optionalIdString('client_id'),
  project_id: optionalIdString('project_id'),
  receiver_name: text('Receiver name', { max: 300 }),
  receiver_email: optionalEmail('Receiver email'),
  amount: z.number({ error: 'Amount must be greater than 0' }).finite().positive('Amount must be greater than 0'),
  reason: text('Reason', { max: 200 }),
  issued_by_signer_id: idString('the issuing signer'),
  received_by_signer_id: idString('the receiving signer'),
  show_paid_stamp: z.boolean({ error: 'show_paid_stamp must be true or false' }).optional().default(true),
  show_company_stamp: z.boolean({ error: 'show_company_stamp must be true or false' }).optional().default(true),
  document_language: z.enum(DOCUMENT_LANGUAGES, { error: `Document language must be one of: ${DOCUMENT_LANGUAGES.join(', ')}` }).optional().default('en'),
  payment_id: optionalIdString('payment_id'),
})

export const createReceiptBody = receiptCoreBody

export const updateReceiptBody = receiptCoreBody.refine((data) => data.receipt_number !== null, {
  message: 'Receipt number is required',
  path: ['receipt_number'],
})

export const cancelReceiptBody = z.object({ reason: text('A reason', { max: 500 }) })
