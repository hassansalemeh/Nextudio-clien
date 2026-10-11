import { addDays, durationMs, localDateString } from '../../../shared/lib/timeUtils'
import type { TimeEntry } from '../../../shared/lib/timeUtils'
import type { DayOffRequest } from '../../day-off-requests/types'

export type CalendarDayState = 'before-history' | 'weekend' | 'future' | 'today-pending' | 'submitted' | 'missed' | 'day-off'

export type CalendarDay = {
  date: string
  inMonth: boolean
  state: CalendarDayState
  entries: TimeEntry[]
  dayOff: DayOffRequest | null
}

export type MonthSummary = {
  totalHours: number
  pendingHours: number
  daysSubmitted: number
  daysMissed: number
  daysOff: number
  hoursByProject: Record<string, number>
}

function groupEntriesByDay(entries: TimeEntry[]): Map<string, TimeEntry[]> {
  const map = new Map<string, TimeEntry[]>()
  for (const entry of entries) {
    const day = localDateString(new Date(entry.started_at))
    const list = map.get(day)
    if (list) list.push(entry)
    else map.set(day, [entry])
  }
  return map
}

// An approved day off always wins (never "missed"); pending/rejected don't change the state at all -
// they're attached to the day separately so the UI can show them "on top of" the normal submitted/missed label.
function classifyDay(
  date: string,
  dayEntries: TimeEntry[],
  today: string,
  firstActivityDate: string | null,
  approvedDayOff: boolean
): CalendarDayState {
  if (approvedDayOff) return 'day-off'
  if (date > today) return 'future'
  const weekday = new Date(`${date}T00:00:00`).getDay()
  if (weekday === 0 || weekday === 6) return 'weekend'
  if (date === today) return dayEntries.length > 0 ? 'submitted' : 'today-pending'
  if (!firstActivityDate || date < firstActivityDate) return 'before-history'
  return dayEntries.length > 0 ? 'submitted' : 'missed'
}

// Monday-start grid, always 6 weeks (42 days) so every month's layout fits; days from neighboring
// months fill the leading/trailing rows and are marked inMonth: false.
export function buildMonthGrid(
  year: number,
  month: number,
  entries: TimeEntry[],
  today: string,
  firstActivityDate: string | null,
  dayOffRequests: DayOffRequest[] = []
): CalendarDay[][] {
  const entriesByDay = groupEntriesByDay(entries)
  const dayOffByDate = new Map(dayOffRequests.map((request) => [request.request_date, request]))
  const firstOfMonth = localDateString(new Date(year, month - 1, 1))
  const leadingDays = (new Date(year, month - 1, 1).getDay() + 6) % 7
  let cursor = addDays(firstOfMonth, -leadingDays)

  const weeks: CalendarDay[][] = []
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = []
    for (let d = 0; d < 7; d++) {
      const [cursorYear, cursorMonth] = cursor.split('-').map(Number)
      const dayEntries = entriesByDay.get(cursor) ?? []
      const dayOff = dayOffByDate.get(cursor) ?? null
      week.push({
        date: cursor,
        inMonth: cursorYear === year && cursorMonth === month,
        state: classifyDay(cursor, dayEntries, today, firstActivityDate, dayOff?.status === 'approved'),
        entries: dayEntries,
        dayOff,
      })
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  }
  return weeks
}

// Totals count only approved entries; pending hours are surfaced separately and rejected ones are dropped.
// A day still counts as "submitted" if it has any entry at all, regardless of status.
export function summarizeMonth(weeks: CalendarDay[][]): MonthSummary {
  let totalHours = 0
  let pendingHours = 0
  let daysSubmitted = 0
  let daysMissed = 0
  let daysOff = 0
  const hoursByProject: Record<string, number> = {}

  for (const day of weeks.flat()) {
    if (!day.inMonth) continue
    if (day.state === 'submitted') daysSubmitted += 1
    if (day.state === 'missed') daysMissed += 1
    if (day.state === 'day-off') daysOff += 1
    for (const entry of day.entries) {
      if (entry.status === 'rejected') continue
      const hours = durationMs(entry.started_at, entry.ended_at) / 3600000
      if (entry.status === 'pending') {
        pendingHours += hours
        continue
      }
      totalHours += hours
      hoursByProject[entry.project_name] = (hoursByProject[entry.project_name] ?? 0) + hours
    }
  }

  return { totalHours, pendingHours, daysSubmitted, daysMissed, daysOff, hoursByProject }
}
