import { ADMIN_SIGNERS, ADMIN_WHATSAPP_NUMBERS } from '../../config'
import { HttpError, isIsoDate } from '../../shared'
import * as dayOffRequestsRepository from './day-off-requests.repository'

// The company runs on Beirut time; the server (and its UTC clock) can be hours behind it, so "today"/"the
// past" for a day-off request must be computed in the company's own timezone, not the server's.
const COMPANY_TIMEZONE = 'Asia/Beirut'

function todayInCompanyTimezone(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: COMPANY_TIMEZONE })
}

// A calendar date's day of week is the same everywhere, so this doesn't need a timezone - only "today" does.
function isWeekend(dateString: string): boolean {
  const [year, month, day] = dateString.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 || weekday === 6
}

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

export async function listDayOffRequests(organizationId: string, employeeId: string | null) {
  return employeeId
    ? dayOffRequestsRepository.selectDayOffRequestsForEmployee(organizationId, employeeId)
    : dayOffRequestsRepository.selectAllDayOffRequests(organizationId)
}

export async function createDayOffRequest(
  organizationId: string,
  employeeId: string,
  employeeName: string,
  date: unknown,
  reason: unknown
) {
  if (!isIsoDate(date)) throw new HttpError(400, 'Choose a date')
  const requestDate = date
  if (requestDate < todayInCompanyTimezone()) throw new HttpError(400, 'Choose a date that is not in the past')
  if (isWeekend(requestDate)) throw new HttpError(400, 'Weekends cannot be requested off')
  const reasonText = typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 1000) : null

  const existing = await dayOffRequestsRepository.selectActiveRequestForDate(organizationId, employeeId, requestDate)
  if (existing) throw new HttpError(400, 'A request already exists for this date')

  const created = await dayOffRequestsRepository.insertDayOffRequest(employeeId, requestDate, reasonText)
  return { ...created, whatsappLinks: buildWhatsAppLinks(employeeName, requestDate, created.id) }
}

export async function cancelDayOffRequest(organizationId: string, employeeId: string, id: unknown) {
  if (typeof id !== 'string' || !id) throw new HttpError(400, 'id is required')
  const rowCount = await dayOffRequestsRepository.deletePendingDayOffRequest(organizationId, employeeId, id)
  if (rowCount === 0) throw new HttpError(400, 'This request can no longer be cancelled')
}

export async function reviewDayOffRequest(organizationId: string, id: string, status: 'approved' | 'rejected', reviewedBy: string) {
  const rowCount = await dayOffRequestsRepository.reviewDayOffRequest(organizationId, id, status, reviewedBy)
  if (rowCount === 0) throw new HttpError(400, 'This request was already reviewed')
}
