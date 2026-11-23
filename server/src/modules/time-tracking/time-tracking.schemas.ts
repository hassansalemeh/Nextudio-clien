import { z } from 'zod'
import { idString, isoDate, isoDateTime, optionalIdString, optionalIsoDateTime, text } from '../../shared'

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const timeOfDay = (label: string) =>
  z.string({ error: `${label} is required` }).trim().regex(TIME_OF_DAY_RE, `${label} must be a time in HH:MM format`)

// employee_id is optional in every one of these: an Employee's own calls always have it filled in afterward
// regardless of what they send (see resolveEmployeeId), so "employee_id is required" is checked once that
// substitution has happened, in the route, not as a shape rule here.
export const employeeIdQuery = z.object({ employee_id: optionalIdString('employee_id') })
export const employeeIdBody = z.object({ employee_id: optionalIdString('employee_id') })

export const timeDayQuery = z.object({
  employee_id: optionalIdString('employee_id'),
  from: isoDateTime('from'),
  to: isoDateTime('to'),
})

export const startWorkBody = z.object({
  employee_id: optionalIdString('employee_id'),
  project_id: idString('project_id'),
  date: isoDate('date'),
})

export const manualWorkBody = z.object({
  employee_id: optionalIdString('employee_id'),
  project_id: idString('project_id'),
  date: isoDate('date'),
  start: isoDateTime('start'),
  end: isoDateTime('end'),
  day_start: isoDateTime('day_start'),
  day_end: isoDateTime('day_end'),
  description: text('description', { max: 2000 }),
})

export const timeCorrectionParams = z.object({ id: idString('id') })

// end may be left out (null) to leave the item running/clocked in.
export const timeCorrectionBody = z.object({
  start: isoDateTime('A valid start time'),
  end: optionalIsoDateTime('End time'),
})

// ---- legacy work_entries (v1 time tracking, left in place but unreachable from the UI) ----

export const workEntriesListQuery = z.object({ project_id: idString('project_id') })

export const createWorkEntryBody = z.object({
  project_id: idString('project_id'),
  employee_id: idString('employee_id'),
  work_date: isoDate('work_date'),
  start_time: timeOfDay('start_time'),
  end_time: timeOfDay('end_time'),
})
