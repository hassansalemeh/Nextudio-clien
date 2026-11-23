import { z } from 'zod'
import { idString, money, optionalEmail, text } from '../../shared'

export const employeeIdParams = z.object({ employeeId: idString('Employee id') })

export const createEmployeeBody = z.object({
  full_name: text('full_name'),
  position: text('position'),
  monthly_salary: money('monthly_salary'),
  contact_email: optionalEmail('Contact email'),
})

export const updateEmployeeBody = createEmployeeBody.extend({
  is_active: z.boolean({ error: 'is_active must be true or false' }),
})
