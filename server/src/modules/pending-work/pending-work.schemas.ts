import { z } from 'zod'
import { idString, optionalIsoDate, optionalText } from '../../shared'

export const pendingWorkEntryIdParams = z.object({ id: idString('Entry id') })

// These three are only actually used when the employee isn't already covered by an assignment on that date
// (see approvePendingWorkEntry) - so they stay optional here, format-checked only when present, and the
// "required in this case" business rule stays where it was, in the service.
export const approvePendingWorkEntryBody = z.object({
  start_date: optionalIsoDate('Assignment start date'),
  end_date: optionalIsoDate('Assignment end date'),
  description: optionalText('Task description', { max: 2000 }),
})
