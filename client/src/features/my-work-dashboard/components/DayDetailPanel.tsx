import EmptyState from '../../../shared/components/EmptyState'
import { durationMs, formatDuration, formatLongDate, formatTime } from '../../../shared/lib/timeUtils'
import type { CalendarDay } from '../lib/calendar'

type Props = {
  day: CalendarDay | null
  // Opens a confirmation dialog; the dialog itself shows the busy state while cancelling
  onCancelDayOff?: (id: string) => void
}

function emptyMessage(day: CalendarDay) {
  switch (day.state) {
    case 'missed':
      return 'No work was logged on this day.'
    case 'weekend':
      return "It's a weekend — nothing expected here."
    case 'future':
      return "This day hasn't happened yet."
    case 'before-history':
      return 'This is before your work history starts.'
    case 'day-off':
      return 'This is a day off.'
    default:
      return 'Nothing logged yet today.'
  }
}

function DayDetailPanel({ day, onCancelDayOff }: Props) {
  if (!day) {
    return (
      <div className="card">
        <h2>Day details</h2>
        <EmptyState message="Pick a day on the calendar to see what you logged." />
      </div>
    )
  }

  return (
    <div className="card">
      <h2>{formatLongDate(day.date)}</h2>

      {day.dayOff && (
        <p className="doc-hint" style={{ marginBottom: '1rem' }}>
          <span className={`status-badge status-${day.dayOff.status}`}>
            {day.dayOff.status === 'pending' ? 'Day off requested' : day.dayOff.status === 'approved' ? 'Day off approved' : 'Day off declined'}
          </span>
          {day.dayOff.reason && <> — {day.dayOff.reason}</>}
                    {day.dayOff.status === 'pending' && onCancelDayOff && (
            <>
              {' '}
              <button type="button" className="btn-sm btn-ghost" onClick={() => onCancelDayOff(day.dayOff!.id)}>
                Cancel request
              </button>
            </>
          )}
        </p>
      )}

      {day.entries.length === 0 ? (
        <EmptyState message={emptyMessage(day)} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Description</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {day.entries.map((entry) => (
              <tr key={entry.id}>
                <td data-label="Project">{entry.project_name}</td>
                <td data-label="Start">{formatTime(entry.started_at)}</td>
                <td data-label="End">{entry.ended_at ? formatTime(entry.ended_at) : 'running'}</td>
                <td data-label="Duration">{formatDuration(durationMs(entry.started_at, entry.ended_at))}</td>
                <td data-label="Description" className="col-wrap">{entry.description || '—'}</td>
                <td data-label="Status">
                  {entry.status === 'pending' && <span className="status-badge status-pending">Waiting for approval</span>}
                  {entry.status === 'rejected' && <span className="status-badge status-rejected">Rejected</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default DayDetailPanel
