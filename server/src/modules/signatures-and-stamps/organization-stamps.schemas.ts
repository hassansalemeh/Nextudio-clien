import { z } from 'zod'

const KINDS = ['paid_stamp', 'company_stamp'] as const

export const stampKindParams = z.object({
  kind: z.enum(KINDS, { error: 'kind must be "paid_stamp" or "company_stamp"' }),
})
