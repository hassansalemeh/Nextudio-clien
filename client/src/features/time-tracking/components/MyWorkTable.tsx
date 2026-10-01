import { durationMs, formatDuration, formatTime, localDateString } from '../../../shared/lib/timeUtils'
import type { DayData } from '../../../shared/lib/timeUtils'

type Props = {
  workDate: string
  today: DayData
}

function MyWorkTable({ workDate, today }: Props) {
  return (
    <div className="card">
      <h2>{workDate === localDateString() ? 'My Work Today' : `My Work on ${workDate}`}</h2>
      {today.entries.length === 0 ? (
        <p className="empty-state">{workDate === localDateString() ? 'No work recorded yet today.' : 'No work recorded on this date.'}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Description</th>
              <th>Start</th>
              <th>End</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {today.entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.project_name}</td>
                <td className="col-wrap">{entry.description || '—'}</td>
                <td>{formatTime(entry.started_at)}</td>
                <td>{entry.ended_at ? formatTime(entry.ended_at) : 'running'}</td>
                <td>{formatDuration(durationMs(entry.started_at, entry.ended_at))}</td>
                <td>
                  {entry.status === 'pending' && (
                    <span className="status-badge status-pending">Waiting for approval</span>
                  )}
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

export default MyWorkTable
