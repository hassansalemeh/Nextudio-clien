import { z } from 'zod'
import { idString, isoDate, optionalText, text } from '../../shared'

export const disbursementInvoiceIdParams = z.object({ invoiceId: idString('Invoice id') })

export const disbursementParams = disbursementInvoiceIdParams.extend({
  disbursementId: idString('Disbursement id'),
})

export const disbursementBody = z.object({
  disbursement_date: isoDate('Date'),
  payee: text('Payee'),
  description: optionalText('Description', { max: 2000 }),
  category: optionalText('Category'),
  amount: z.number({ error: 'Amount must be greater than 0' }).finite().positive('Amount must be greater than 0'),
  reference: optionalText('Reference', { max: 500 }),
})
