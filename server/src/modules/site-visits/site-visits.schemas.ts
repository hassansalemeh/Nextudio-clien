import { z } from 'zod'
import { idString, isoDate, optionalIdString, optionalText } from '../../shared'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function timeOfDay(label: string) {
  return z.string({ error: `${label} is required` }).regex(TIME_RE, `${label} must be a valid time (HH:MM)`)
}

function optionalTimeOfDay(label: string) {
  return z.union([z.null(), timeOfDay(label)]).optional().default(null)
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function monthString(label = 'month') {
  return z.string({ error: `${label} is required` }).regex(MONTH_RE, `${label} must be in YYYY-MM format`)
}

// employee_id is optional here for the same reason as day-off-requests: an Employee's own calls always get it
// filled in afterward regardless of what they send (see resolveEmployeeId); an Admin may omit it to see everyone.
export const siteVisitListQuery = z.object({
  month: monthString(),
  employee_id: optionalIdString('employee_id'),
  project_id: optionalIdString('project_id'),
})

export const siteVisitSummaryQuery = z.object({ month: monthString() })

export const siteVisitIdParams = z.object({ id: idString('Visit id') })

function withTimeOrder<T extends { start_time: string; end_time: string | null }>(schema: z.ZodType<T>) {
  return schema.superRefine((data, ctx) => {
    if (data.end_time && data.end_time <= data.start_time) {
      ctx.addIssue({ code: 'custom', message: 'end_time must be after start_time', path: ['end_time'] })
    }
  })
}

export const createSiteVisitBody = withTimeOrder(
  z.object({
    employee_id: optionalIdString('employee_id'),
    project_id: idString('project_id'),
    visit_date: isoDate('visit_date'),
    start_time: timeOfDay('start_time'),
    end_time: optionalTimeOfDay('end_time'),
    note: optionalText('note', { max: 500 }),
  })
)

// Reassigning a visit to another employee isn't supported - only its project/date/time/note can be corrected.
export const updateSiteVisitBody = withTimeOrder(
  z.object({
    project_id: idString('project_id'),
    visit_date: isoDate('visit_date'),
    start_time: timeOfDay('start_time'),
    end_time: optionalTimeOfDay('end_time'),
    note: optionalText('note', { max: 500 }),
  })
)
