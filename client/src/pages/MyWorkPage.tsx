import { useCallback, useEffect, useState } from 'react'
import { dayRange, durationMs, formatDuration, formatTime, localDateString } from '../timeUtils'
import type { DayData, TimeSession } from '../timeUtils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type TodayAssignment = {
  id: string
  project_id: string
  project_name: string
  description: string
  start_date: string
  end_date: string
}

type Status = {
  session: TimeSession | null
  active_entry: { id: string; project_id: string; project_name: string; started_at: string } | null
}

// The server knows who is logged in and only ever returns/changes that employee's own data
function MyWorkPage() {
  const [status, setStatus] = useState<Status>({ session: null, active_entry: null })
  const [assignments, setAssignments] = useState<TodayAssignment[]>([])
  const [today, setToday] = useState<DayData>({ sessions: [], entries: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)

  // "Add Work Manually": for time the employee forgot to record with the timer
  const [workDate, setWorkDate] = useState(localDateString())
  const [dateAssignments, setDateAssignments] = useState<TodayAssignment[]>([])
  const [manualProject, setManualProject] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualError, setManualError] = useState('')
  const [manualDone, setManualDone] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  const reload = useCallback(async () => {
    const date = localDateString()
    const { from, to } = dayRange(workDate)
    try {
      const [statusResponse, dayResponse, assignmentsResponse] = await Promise.all([
        fetch(`${API_URL}/api/time/status`),
        fetch(`${API_URL}/api/time/day?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        fetch(`${API_URL}/api/work-assignments?date=${date}`),
      ])
      if (!statusResponse.ok || !dayResponse.ok || !assignmentsResponse.ok) {
        throw new Error('Failed to load')
      }
      setStatus(await statusResponse.json())
      setToday(await dayResponse.json())
      setAssignments(await assignmentsResponse.json())
    } catch {
      setError('Could not load your work. Please refresh.')
    }
  }, [workDate])

  useEffect(() => {
    reload()
  }, [reload])

  // Projects assigned to the employee on the selected date (the only ones that can be chosen)
  useEffect(() => {
    if (!workDate) return
    fetch(`${API_URL}/api/work-assignments?date=${workDate}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: TodayAssignment[]) => {
        setDateAssignments(data)
        setManualProject((current) => (data.some((a) => String(a.project_id) === current) ? current : ''))
      })
      .catch(() => setDateAssignments([]))
  }, [workDate])

  // Keep running durations fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  async function act(path: string, body: Record<string, string> = {}) {
    setError('')
    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/time/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error || 'Something went wrong.')
      }
    } catch {
      setError('Could not reach the server.')
    } finally {
      await reload()
      setBusy(false)
    }
  }

  async function addManualEntry(event: React.FormEvent) {
    event.preventDefault()
    setManualError('')
    setManualDone('')

    if (!workDate) return setManualError('Choose a date.')
    if (!manualProject) return setManualError('Choose a project.')
    if (!manualStart || !manualEnd) return setManualError('Enter a start time and an end time.')
    if (manualEnd <= manualStart) return setManualError('End time must be after start time.')
    if (!manualDescription.trim()) return setManualError('Describe what you worked on.')

    // Times are typed in local time; the server receives exact instants plus the boundaries of the chosen day
    const { from, to } = dayRange(workDate)
    setManualBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/time/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: manualProject,
          date: workDate,
          start: new Date(`${workDate}T${manualStart}:00`).toISOString(),
          end: new Date(`${workDate}T${manualEnd}:00`).toISOString(),
          day_start: from,
          day_end: to,
          description: manualDescription,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Could not add the work entry.')
      }
      setManualStart('')
      setManualEnd('')
      setManualDescription('')
      setManualDone('Work entry added.')
      await reload()
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Could not add the work entry.')
    } finally {
      setManualBusy(false)
    }
  }

  const clockedIn = status.session !== null
  const active = status.active_entry

  return (
    <>
      <h1>My Tasks</h1>
      {error && <p className="error-message">{error}</p>}

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

      <div className="card">
        <h2>Assigned to Me</h2>
        {assignments.length === 0 ? (
          <p className="empty-state">Nothing is assigned to you today.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Task</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => {
                const isActive = active !== null && String(active.project_id) === String(assignment.project_id)
                return (
                  <tr key={assignment.id}>
                    <td>{assignment.project_name}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{assignment.description}</td>
                    <td>{assignment.start_date}</td>
                    <td>{assignment.end_date}</td>
                    <td>
                      {isActive ? (
                        <strong>Working</strong>
                      ) : (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busy || !clockedIn}
                          title={clockedIn ? undefined : 'Clock in first'}
                          onClick={() => act('start', { project_id: assignment.project_id, date: localDateString() })}
                        >
                          Start Work
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {!clockedIn && assignments.length > 0 && <p className="empty-state">Clock in to start work.</p>}
      </div>

      <div className="card">
        <h2>Add Work Manually</h2>
        <p className="empty-state">Forgot to start or stop the timer? Add the work you did.</p>
        <form onSubmit={addManualEntry} noValidate>
          <div className="form-grid">
            <label className="form-field">
              Date
              <input
                type="date"
                value={workDate}
                max={localDateString()}
                onChange={(e) => {
                  // don't show the previous day's entries under the new date while the new day loads
                  setToday({ sessions: [], entries: [] })
                  setWorkDate(e.target.value)
                }}
              />
            </label>
            <label className="form-field">
              Project
              <select value={manualProject} onChange={(e) => setManualProject(e.target.value)}>
                <option value="">{dateAssignments.length === 0 ? 'No project assigned on this date' : 'Select a project'}</option>
                {[...new Map(dateAssignments.map((a) => [String(a.project_id), a.project_name])).entries()].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Start Time
              <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
            </label>
            <label className="form-field">
              End Time
              <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Description / What did you work on?
              <textarea
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="e.g. Prepared PowerPoint and revised drawings for the client meeting"
              />
            </label>
          </div>
          <button type="submit" className="btn-primary" disabled={manualBusy}>
            Add Work Entry
          </button>
          {manualError && <p className="error-message">{manualError}</p>}
          {manualDone && <p className="doc-saved">{manualDone}</p>}
        </form>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {today.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.project_name}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{entry.description || '—'}</td>
                  <td>{formatTime(entry.started_at)}</td>
                  <td>{entry.ended_at ? formatTime(entry.ended_at) : 'running'}</td>
                  <td>{formatDuration(durationMs(entry.started_at, entry.ended_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default MyWorkPage
