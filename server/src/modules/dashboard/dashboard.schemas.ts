import { z } from 'zod'
import { optionalIsoDateTime } from '../../shared'

export const dashboardQuery = z.object({
  day_from: optionalIsoDateTime('day_from'),
  day_to: optionalIsoDateTime('day_to'),
})
