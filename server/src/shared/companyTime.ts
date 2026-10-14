// The company runs on Beirut time; the server's own clock (UTC) can be hours off, so "today", day-of-week,
// and "what time is it right now" checks that matter to people (day-off requests, work reminders) must be
// computed in the company's own timezone, not the server's.
export const COMPANY_TIMEZONE = 'Asia/Beirut'

export function todayInCompanyTimezone(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: COMPANY_TIMEZONE })
}

// A calendar date's day of week is the same everywhere, so this doesn't need a timezone - only "today" does.
export function isWeekend(dateString: string): boolean {
  const [year, month, day] = dateString.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 || weekday === 6
}

// The current wall-clock time in the company's timezone, as "HH:MM" (24h, zero-padded) - comparable with a
// configured "HH:MM" env var like REMINDER_TIME using plain string comparison.
export function nowTimeInCompanyTimezone(): string {
  return new Date().toLocaleTimeString('en-GB', { timeZone: COMPANY_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })
}
