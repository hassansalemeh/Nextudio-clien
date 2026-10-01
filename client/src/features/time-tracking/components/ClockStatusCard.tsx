import { durationMs, formatDuration, formatTime } from '../../../shared/lib/timeUtils'
import type { Status } from '../types'

type Props = {
  status: Status
  busy: boolean
  act: (path: string, body?: Record<string, string>) => void
}

function ClockStatusCard({ status, busy, act }: Props) {
  const clockedIn = status.session !== null
  const active = status.active_entry

  return (
    <>
      <div className="card">
        <h2>Today</h2>
        {clockedIn ? (
          <p>
            Clocked in since <strong>{formatTime(status.session!.clock_in)}</strong>
          </p>
        ) : (
          <p className="empty-state">You are not clocked in.</p>
        )}
        {clockedIn ? (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => act('clock-out')}>
            Clock Out
          </button>
        ) : (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => act('clock-in')}>
            Clock In
          </button>
        )}
      </div>

      {clockedIn && (
        <div className="card">
          <h2>Current Project</h2>
          {active ? (
            <>
              <p>
                Working on <strong>{active.project_name}</strong> since {formatTime(active.started_at)} (
                {formatDuration(durationMs(active.started_at, null))})
              </p>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => act('stop')}>
                Stop Work / Break
              </button>
            </>
          ) : (
            <p className="empty-state">No project running. Start one below.</p>
          )}
        </div>
      )}
    </>
  )
}

export default ClockStatusCard
