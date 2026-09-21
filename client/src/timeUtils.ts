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
