import { z } from 'zod'
import { idString, money, optionalEmail, optionalMoney, text } from '../../shared'

export const employeeIdParams = z.object({ employeeId: idString('Employee id') })

export const EMPLOYEE_KINDS = ['staff', 'site_worker'] as const

const employeeFields = {
  full_name: text('full_name'),
  position: text('position'),
  kind: z.enum(EMPLOYEE_KINDS, { error: `kind must be one of: ${EMPLOYEE_KINDS.join(', ')}` }).optional().default('staff'),
  // Staff still gets their rate from monthly_salary (see hourlyRateOf); a site worker is paid per hour
  // instead, so monthly_salary stays 0 for them and hourly_rate is required.
  monthly_salary: money('monthly_salary'),
  hourly_rate: optionalMoney('hourly_rate'),
  contact_email: optionalEmail('Contact email'),
}

function requireHourlyRateForSiteWorker(data: { kind: string; hourly_rate: number | null }) {
  return data.kind !== 'site_worker' || data.hourly_rate !== null
}
const HOURLY_RATE_REQUIRED = { message: 'hourly_rate is required for a site worker', path: ['hourly_rate'] }

export const createEmployeeBody = z.object(employeeFields).refine(requireHourlyRateForSiteWorker, HOURLY_RATE_REQUIRED)

export const updateEmployeeBody = z
  .object({ ...employeeFields, is_active: z.boolean({ error: 'is_active must be true or false' }) })
  .refine(requireHourlyRateForSiteWorker, HOURLY_RATE_REQUIRED)
