import { z } from 'zod'
import { idString, money, optionalEmail, optionalMoney, text } from '../../shared'

export const employeeIdParams = z.object({ employeeId: idString('Employee id') })

export const EMPLOYEE_KINDS = ['staff', 'site_worker'] as const
const KIND_ENUM_ERROR = `kind must be one of: ${EMPLOYEE_KINDS.join(', ')}`

// Staff still gets their rate from monthly_salary (see hourlyRateOf); a site worker is paid per hour
// instead, so monthly_salary stays 0 for them and hourly_rate is required.
const employeeFieldsWithoutKind = {
  full_name: text('full_name'),
  position: text('position'),
  monthly_salary: money('monthly_salary'),
  hourly_rate: optionalMoney('hourly_rate'),
  contact_email: optionalEmail('Contact email'),
}

function requireHourlyRateForSiteWorker(data: { kind: string; hourly_rate: number | null }) {
  return data.kind !== 'site_worker' || data.hourly_rate !== null
}
const HOURLY_RATE_REQUIRED = { message: 'hourly_rate is required for a site worker', path: ['hourly_rate'] }

// Creating defaults to 'staff' (the overwhelmingly common case). Updating an existing employee must say
// which kind it already is, every time - a default here would silently flip a site worker back to staff
// the moment any other field on them was edited without the admin's UI sending kind along.
export const createEmployeeBody = z
  .object({ ...employeeFieldsWithoutKind, kind: z.enum(EMPLOYEE_KINDS, { error: KIND_ENUM_ERROR }).optional().default('staff') })
  .refine(requireHourlyRateForSiteWorker, HOURLY_RATE_REQUIRED)

export const updateEmployeeBody = z
  .object({
    ...employeeFieldsWithoutKind,
    kind: z.enum(EMPLOYEE_KINDS, { error: KIND_ENUM_ERROR }),
    is_active: z.boolean({ error: 'is_active must be true or false' }),
  })
  .refine(requireHourlyRateForSiteWorker, HOURLY_RATE_REQUIRED)
