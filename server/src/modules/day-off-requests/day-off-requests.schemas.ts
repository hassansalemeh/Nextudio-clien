import { z } from 'zod'
import { idString, isoDate, optionalIdString, optionalText } from '../../shared'

// employee_id is optional here: an Employee's own calls always have it filled in afterward regardless of
// what they send (see resolveEmployeeId), so "employee_id is required" is checked once that substitution has
// happened, in the route, not as a shape rule here. An Admin may omit it entirely (sees every employee).
export const dayOffListQuery = z.object({ employee_id: optionalIdString('employee_id') })

export const createDayOffRequestBody = z.object({
  employee_id: optionalIdString('employee_id'),
  date: isoDate('date'),
  reason: optionalText('reason', { max: 1000 }),
})

export const cancelDayOffRequestBody = z.object({
  employee_id: optionalIdString('employee_id'),
  id: idString('id'),
})

export const dayOffRequestIdParams = z.object({ id: idString('Request id') })

// An admin approving an employee's own request chooses paid or unpaid; defaults to paid.
export const approveDayOffRequestBody = z.object({
  is_paid: z.boolean({ error: 'is_paid must be true or false' }).optional().default(true),
})

const MAX_RECORD_DAYS_OFF_RANGE_DAYS = 31

// Admin recording days off directly (no request/approval step, past dates allowed) for a staff member,
// one row per weekday in [from, to]. to must be on or after from, and the range capped at 31 days so a
// typo (e.g. the wrong year) can't silently create months of rows.
export const recordDaysOffBody = z
  .object({
    employee_id: idString('employee_id'),
    from: isoDate('from'),
    to: isoDate('to'),
    is_paid: z.boolean({ error: 'is_paid must be true or false' }).optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.to < data.from) {
      ctx.addIssue({ code: 'custom', message: 'to must be on or after from', path: ['to'] })
      return
    }
    const fromMs = new Date(`${data.from}T00:00:00Z`).getTime()
    const toMs = new Date(`${data.to}T00:00:00Z`).getTime()
    const rangeDays = Math.round((toMs - fromMs) / 86400000) + 1
    if (rangeDays > MAX_RECORD_DAYS_OFF_RANGE_DAYS) {
      ctx.addIssue({ code: 'custom', message: `The range cannot be more than ${MAX_RECORD_DAYS_OFF_RANGE_DAYS} days`, path: ['to'] })
    }
  })
