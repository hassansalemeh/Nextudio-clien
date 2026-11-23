import { z } from 'zod'
import { idString, isoDate, optionalIdString, optionalText, text } from '../../shared'

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'card', 'other'] as const

export const paymentIdParams = z.object({ paymentId: idString('Payment id') })

export const paymentListQuery = z.object({ project_id: optionalIdString('project_id') })

export const paymentBody = z.object({
  project_id: idString('project_id'),
  invoice_id: optionalIdString('invoice_id'),
  payment_date: isoDate('Payment date'),
  amount: z.number({ error: 'Amount received must be greater than 0' }).finite().positive('Amount received must be greater than 0'),
  reason: text('Reason', { max: 200 }),
  method: z.enum(PAYMENT_METHODS, { error: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}` }).nullable().optional().default(null),
  reference: optionalText('Reference', { max: 500 }),
})

export const cancelPaymentBody = z.object({ reason: text('A reason', { max: 500 }) })
