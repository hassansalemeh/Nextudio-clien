import { addDays, durationMs, localDateString } from '../../../shared/lib/timeUtils'
import type { TimeEntry } from '../../../shared/lib/timeUtils'

export type CalendarDayState = 'before-history' | 'weekend' | 'future' | 'today-pending' | 'submitted' | 'missed'

export type CalendarDay = {
  date: string
  inMonth: boolean
  state: CalendarDayState
  entries: TimeEntry[]
}

export type MonthSummary = {
  totalHours: number
  pendingHours: number
  daysSubmitted: number
  daysMissed: number
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

function classifyDay(date: string, dayEntries: TimeEntry[], today: string, firstActivityDate: string | null): CalendarDayState {
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
  firstActivityDate: string | null
): CalendarDay[][] {
  const entriesByDay = groupEntriesByDay(entries)
  const firstOfMonth = localDateString(new Date(year, month - 1, 1))
  const leadingDays = (new Date(year, month - 1, 1).getDay() + 6) % 7
  let cursor = addDays(firstOfMonth, -leadingDays)

  const weeks: CalendarDay[][] = []
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = []
    for (let d = 0; d < 7; d++) {
      const [cursorYear, cursorMonth] = cursor.split('-').map(Number)
      const dayEntries = entriesByDay.get(cursor) ?? []
      week.push({
        date: cursor,
        inMonth: cursorYear === year && cursorMonth === month,
        state: classifyDay(cursor, dayEntries, today, firstActivityDate),
        entries: dayEntries,
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
  const hoursByProject: Record<string, number> = {}

  for (const day of weeks.flat()) {
    if (!day.inMonth) continue
    if (day.state === 'submitted') daysSubmitted += 1
    if (day.state === 'missed') daysMissed += 1
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

  return { totalHours, pendingHours, daysSubmitted, daysMissed, hoursByProject }
}
