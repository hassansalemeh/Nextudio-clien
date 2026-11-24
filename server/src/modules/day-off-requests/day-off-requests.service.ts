import { ADMIN_SIGNERS, ADMIN_WHATSAPP_NUMBERS } from '../../config'
import { HttpError, isWeekend, todayInCompanyTimezone } from '../../shared'
import * as dayOffRequestsRepository from './day-off-requests.repository'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatShortDate(dateString: string): string {
  const [, month, day] = dateString.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${day}`
}

function buildWhatsAppLinks(employeeName: string, dateString: string, requestId: string) {
  const base = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
  const reviewUrl = `${base}/day-off-requests/${requestId}`
  const message = `${employeeName} requested a day off on ${formatShortDate(dateString)}. Review: ${reviewUrl}`
  const links: { admin: string; url: string }[] = []
  for (const admin of ADMIN_SIGNERS) {
    const number = ADMIN_WHATSAPP_NUMBERS[admin]
    if (!number) continue
    links.push({ admin, url: `https://wa.me/${number}?text=${encodeURIComponent(message)}` })
  }
  return links
}

// Calendar-date arithmetic only (no time-of-day, no timezone) - matches isWeekend's own UTC-anchored parsing.
function addDaysToDateString(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function listDayOffRequests(organizationId: string, employeeId: string | null) {
  return employeeId
    ? dayOffRequestsRepository.selectDayOffRequestsForEmployee(organizationId, employeeId)
    : dayOffRequestsRepository.selectAllDayOffRequests(organizationId)
}

// The admin recording that a staff member was off, including past dates, as paid or unpaid - no
// request/approval step, one row per weekday in [from, to] (weekends are skipped, same as everywhere
// else days-off are checked). A date that already has a non-rejected day off is skipped and reported
// back, rather than failing the whole range. Site workers aren't tracked this way - they're casual,
// per-hour workers with no fixed schedule (see hourlyRateOf/EmployeeCalendarReview).
export async function recordDaysOff(organizationId: string, employeeId: string, from: string, to: string, isPaid: boolean, reviewedBy: string) {
  const employee = await dayOffRequestsRepository.selectStaffEmployee(organizationId, employeeId)
  if (!employee) throw new HttpError(400, 'Employee does not exist')
  if (employee.kind === 'site_worker') throw new HttpError(400, 'Site workers are not tracked for days off')

  const created: Awaited<ReturnType<typeof dayOffRequestsRepository.insertRecordedDayOff>>[] = []
  const skipped: string[] = []
  for (let date = from; date <= to; date = addDaysToDateString(date, 1)) {
    if (isWeekend(date)) continue
    const existing = await dayOffRequestsRepository.selectActiveRequestForDate(organizationId, employeeId, date)
    if (existing) {
      skipped.push(date)
      continue
    }
    created.push(await dayOffRequestsRepository.insertRecordedDayOff(employeeId, date, isPaid, reviewedBy))
  }
  return { created, skipped }
}

export async function createDayOffRequest(
  organizationId: string,
  employeeId: string,
  employeeName: string,
  requestDate: string,
  reason: string | null
) {
  if (requestDate < todayInCompanyTimezone()) throw new HttpError(400, 'Choose a date that is not in the past')
  if (isWeekend(requestDate)) throw new HttpError(400, 'Weekends cannot be requested off')

  const existing = await dayOffRequestsRepository.selectActiveRequestForDate(organizationId, employeeId, requestDate)
  if (existing) throw new HttpError(400, 'A request already exists for this date')

  const created = await dayOffRequestsRepository.insertDayOffRequest(employeeId, requestDate, reason)
  return { ...created, whatsappLinks: buildWhatsAppLinks(employeeName, requestDate, created.id) }
}

export async function cancelDayOffRequest(organizationId: string, employeeId: string, id: string) {
  const rowCount = await dayOffRequestsRepository.deletePendingDayOffRequest(organizationId, employeeId, id)
  if (rowCount === 0) throw new HttpError(400, 'This request can no longer be cancelled')
}

export async function reviewDayOffRequest(
  organizationId: string,
  id: string,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  isPaid: boolean = true
) {
  const rowCount = await dayOffRequestsRepository.reviewDayOffRequest(organizationId, id, status, reviewedBy, isPaid)
  if (rowCount === 0) throw new HttpError(400, 'This request was already reviewed')
}

// Admin deleting a recorded or approved day off, in case of a mistake.
export async function deleteDayOffRequest(organizationId: string, id: string) {
  const rowCount = await dayOffRequestsRepository.deleteDayOffRequestById(organizationId, id)
  if (rowCount === 0) throw new HttpError(404, 'Day off not found')
}
