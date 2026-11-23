import { z } from 'zod'
import { idString } from '../../shared'

export const estimateIdParams = z.object({ estimateId: idString('Estimate id') })
export const invoiceIdParams = z.object({ invoiceId: idString('Invoice id') })
export const receiptIdParams = z.object({ receiptId: idString('Receipt id') })
export const letterIdParams = z.object({ letterId: idString('Letter id') })
