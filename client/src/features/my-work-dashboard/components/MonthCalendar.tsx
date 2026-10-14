import styles from '../MyWorkDashboard.module.css'
import type { CalendarDay } from '../lib/calendar'
import { durationMs, formatDuration } from '../../../shared/lib/timeUtils'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATE_LABELS: Record<CalendarDay['state'], string> = {
  'before-history': '',
  weekend: '',
  future: '',
  'today-pending': 'Today',
  submitted: 'Done',
  missed: 'Missed',
  'day-off': 'Day off',
}

const DAY_OFF_BADGE_LABELS = { pending: 'Day off requested', rejected: 'Day off declined' } as const

function dayHours(day: CalendarDay) {
  const ms = day.entries.filter((entry) => entry.status !== 'rejected').reduce((sum, entry) => sum + durationMs(entry.started_at, entry.ended_at), 0)
  return ms > 0 ? formatDuration(ms) : ''
}

function dayProjectHint(day: CalendarDay) {
  const names = [...new Set(day.entries.filter((entry) => entry.status !== 'rejected').map((entry) => entry.project_name))]
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

type Props = {
  year: number
  month: number
  weeks: CalendarDay[][]
  selectedDate: string | null
  onSelectDate: (date: string) => void
  onNavigate: (direction: -1 | 1) => void
}

function MonthCalendar({ year, month, weeks, selectedDate, onSelectDate, onNavigate }: Props) {
  return (
    <div className={`card ${styles.calendarCard}`}>
      <div className={styles.calendarHeader}>
        <button type="button" className="btn-outline" onClick={() => onNavigate(-1)} aria-label="Previous month">
          ‹
        </button>
        <h2>{MONTH_NAMES[month - 1]} {year}</h2>
        <button type="button" className="btn-outline" onClick={() => onNavigate(1)} aria-label="Next month">
          ›
        </button>
      </div>

      {/* Phone-only: the grid below hides each day's text label to keep all 7 columns on screen, so this
          explains what the remaining colors/borders mean. Hidden on wider screens, where the cells keep their labels. */}
      <div className={styles.calendarLegend}>
        <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendSubmitted}`} />Logged</span>
        <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendMissed}`} />Missed</span>
        <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendToday}`} />Today</span>
        <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendDayOff}`} />Day off</span>
        <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.legendRequested}`} />Requested</span>
      </div>

      <div className={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className={styles.weekdayLabel}>{label}</div>
        ))}
      </div>

      <div className={styles.calendarGrid}>
        {weeks.flat().map((day) => (
          <button
            type="button"
            key={day.date}
            disabled={!day.inMonth}
            onClick={() => day.inMonth && onSelectDate(day.date)}
            className={[
              styles.dayCell,
              styles[`day-${day.state}`],
              !day.inMonth ? styles.dayOutside : '',
              selectedDate === day.date ? styles.daySelected : '',
            ].filter(Boolean).join(' ')}
          >
            <span className={styles.dayNumber}>{Number(day.date.slice(-2))}</span>
            {day.inMonth && STATE_LABELS[day.state] && (
              <span className={styles.dayStateLabel}>{STATE_LABELS[day.state]}</span>
            )}
            {day.inMonth && day.state === 'submitted' && (
              <span className={styles.dayHint}>{dayHours(day)} · {dayProjectHint(day)}</span>
            )}
            {day.inMonth && day.dayOff && day.dayOff.status !== 'approved' && (
              <span className={`${styles.dayOffBadge} ${styles[`dayOffBadge-${day.dayOff.status}`]}`}>
                {DAY_OFF_BADGE_LABELS[day.dayOff.status as 'pending' | 'rejected']}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default MonthCalendar
