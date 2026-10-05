export type TimeSession = {
  id: string
  clock_in: string
  clock_out: string | null
}

export type TimeEntry = {
  id: string
  project_id: string
  project_name: string
  started_at: string
  ended_at: string | null
  description?: string | null
  status?: 'approved' | 'pending' | 'rejected'
}

export type DayData = {
  sessions: TimeSession[]
  entries: TimeEntry[]
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

// Local calendar date as YYYY-MM-DD
export function localDateString(date: Date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Parses a YYYY-MM-DD string as a local date (midnight in the browser's own timezone), not UTC -
// new Date("YYYY-MM-DD") parses as UTC, which can land on the wrong calendar day once formatted back
// for a timezone behind UTC. Every date-only helper below goes through this instead.
function parseDateString(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Whole number of calendar days between two YYYY-MM-DD dates (to - from), in local time
export function daysBetween(from: string, to: string) {
  return Math.round((parseDateString(to).getTime() - parseDateString(from).getTime()) / 86400000)
}

// A YYYY-MM-DD date, `days` calendar days after `dateString`, in local time
export function addDays(dateString: string, days: number) {
  const date = parseDateString(dateString)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

// "October 17, 2026", for a YYYY-MM-DD date, in local time
export function formatLongDate(dateString: string) {
  return parseDateString(dateString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// "Sep 24", or "Dec 12, 2025" when the year isn't the current one, for a YYYY-MM-DD date, in local time
export function formatShortDate(dateString: string) {
  const date = parseDateString(dateString)
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString('en-US', options)
}

// "Sep 24" for a single-day span, or "Aug 28 → Sep 21" for a range, for YYYY-MM-DD dates, in local time
export function formatDateRange(startDate: string, endDate: string) {
  if (startDate === endDate) return formatShortDate(startDate)
  return `${formatShortDate(startDate)} → ${formatShortDate(endDate)}`
}

// ISO instants for the start of the given local day and the start of the next one
export function dayRange(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  const from = new Date(year, month - 1, day)
  const to = new Date(year, month - 1, day + 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function formatTime(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function durationMs(start: string, end: string | null) {
  return (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
}

export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000))
  return `${Math.floor(totalMinutes / 60)}h ${pad(totalMinutes % 60)}m`
}

// Value for <input type="datetime-local"> in local time
export function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  return `${localDateString(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : ''
}
