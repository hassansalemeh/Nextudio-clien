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
