import { z } from 'zod'
import { idString, optionalIsoDate, optionalMoney, optionalText, text } from '../../shared'

export const PROJECT_STATUSES = ['planning', 'in_progress', 'completed', 'on_hold'] as const
export const FEE_STATUSES = ['pending', 'confirmed'] as const

export const projectIdParams = z.object({ projectId: idString('Project id') })

// Pending projects may have no fee yet; confirmed projects must have one - a cross-field rule, so it is
// checked with superRefine rather than on the two fields independently.
export const projectBody = z
  .object({
    client_id: idString('client_id'),
    name: text('name'),
    description: optionalText('description', { max: 5000 }),
    start_date: optionalIsoDate('start_date'),
    status: z.enum(PROJECT_STATUSES, { error: `status must be one of: ${PROJECT_STATUSES.join(', ')}` }),
    fee_status: z.enum(FEE_STATUSES, { error: 'fee_status must be pending or confirmed' }).optional().default('pending'),
    total_fee: optionalMoney('total_fee'),
  })
  .superRefine((data, ctx) => {
    if (data.fee_status === 'confirmed' && data.total_fee === null) {
      ctx.addIssue({ code: 'custom', message: 'total_fee is required when the fee is confirmed', path: ['total_fee'] })
    }
  })
