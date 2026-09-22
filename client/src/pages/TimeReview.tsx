import { useCallback, useEffect, useState } from 'react'
import { CheckIcon, CloseIcon, PencilIcon } from '../components/icons'
import {
  dayRange,
  durationMs,
  formatDuration,
  formatTime,
  fromLocalInput,
  localDateString,
  toLocalInput,
} from '../timeUtils'
import type { DayData } from '../timeUtils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Employee = {
  id: string
  full_name: string
}

type Editing = {
  kind: 'entries' | 'sessions'
  id: string
  start: string
  end: string
}

function TimeReview() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(localDateString())
  const [data, setData] = useState<DayData>({ sessions: [], entries: [] })
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/employees`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setEmployees)
      .catch(() => setError('Could not load employees.'))
  }, [])

  const load = useCallback(async () => {
    if (!employeeId || !date) {
      setData({ sessions: [], entries: [] })
      return
    }
    const { from, to } = dayRange(date)
    try {
      const response = await fetch(
        `${API_URL}/api/time/day?employee_id=${employeeId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      )
      if (!response.ok) {
        throw new Error('Failed to load')
      }
      setData(await response.json())
    } catch {
      setError('Could not load time records.')
    }
  }, [employeeId, date])

  useEffect(() => {
    setEditing(null)
    load()
  }, [load])

  async function saveEdit() {
    if (!editing) return
    setError('')
    if (!editing.start) {
      setError('Start time is required.')
      return
    }
    try {
      const response = await fetch(`${API_URL}/api/time/${editing.kind}/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: fromLocalInput(editing.start), end: fromLocalInput(editing.end) }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to save')
      }
      setEditing(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  function startEdit(kind: Editing['kind'], id: string, start: string, end: string | null) {
    setError('')
    setEditing({ kind, id, start: toLocalInput(start), end: toLocalInput(end) })
  }

  function editRow(key: string, colSpan: number) {
    return (
      <tr key={key}>
        <td colSpan={colSpan}>
          <div className="form-grid">
            <label className="form-field">
              Start
              <input
                type="datetime-local"
                value={editing!.start}
                onChange={(e) => setEditing({ ...editing!, start: e.target.value })}
              />
            </label>
            <label className="form-field">
              End (leave empty if still running)
              <input
                type="datetime-local"
                value={editing!.end}
                onChange={(e) => setEditing({ ...editing!, end: e.target.value })}
              />
            </label>
          </div>
          <div className="edit-actions">
            <button type="button" className="btn-sm btn-solid" onClick={saveEdit}>
              <CheckIcon /> Save
            </button>
            <button type="button" className="btn-sm btn-ghost" onClick={() => setEditing(null)}>
              <CloseIcon /> Cancel
            </button>
          </div>
        </td>
      </tr>
    )
  }

  const officeMs = data.sessions.reduce((sum, s) => sum + durationMs(s.clock_in, s.clock_out), 0)

  // Separate entries stay separate in the table; only the totals add them together
  const perProject = new Map<string, number>()
  for (const entry of data.entries) {
    perProject.set(entry.project_name, (perProject.get(entry.project_name) ?? 0) + durationMs(entry.started_at, entry.ended_at))
  }

  return (
    <div className="card">
      <h2>Review Hours</h2>
      <div className="form-grid">
        <label className="form-field">
          Employee
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select an employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {error && <p className="error-message">{error}</p>}

      {employeeId && (
        <>
          <h3>Clock In / Out</h3>
          {data.sessions.length === 0 ? (
            <p className="empty-state">No clock-in on this date.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Clock In</th>
                  <th>Clock Out</th>
                  <th>Duration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.flatMap((session) => [
                  <tr key={session.id}>
                    <td>{formatTime(session.clock_in)}</td>
                    <td>{session.clock_out ? formatTime(session.clock_out) : 'still clocked in'}</td>
                    <td>{formatDuration(durationMs(session.clock_in, session.clock_out))}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-sm btn-ghost"
                        onClick={() => startEdit('sessions', session.id, session.clock_in, session.clock_out)}
                      >
                        <PencilIcon /> Edit
                      </button>
                    </td>
                  </tr>,
                  editing?.kind === 'sessions' && editing.id === session.id ? (
                    editRow(`${session.id}-edit`, 4)
                  ) : null,
                ])}
              </tbody>
            </table>
          )}

          <h3>Project Time</h3>
          {data.entries.length === 0 ? (
            <p className="empty-state">No project time on this date.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.entries.flatMap((entry) => [
                  <tr key={entry.id}>
                    <td>{entry.project_name}</td>
                    <td>{formatTime(entry.started_at)}</td>
                    <td>{entry.ended_at ? formatTime(entry.ended_at) : 'running'}</td>
                    <td>{formatDuration(durationMs(entry.started_at, entry.ended_at))}</td>
                    <td>
                      {entry.status && entry.status !== 'approved' && (
                        <span
                          className={`status-badge status-${entry.status}`}
                          title={
                            entry.status === 'pending'
                              ? 'Waiting for approval; not yet counted in hours or labor cost'
                              : 'Rejected; never counted in hours or labor cost'
                          }
                        >
                          {entry.status === 'pending' ? 'Pending' : 'Rejected'}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-sm btn-ghost"
                        onClick={() => startEdit('entries', entry.id, entry.started_at, entry.ended_at)}
                      >
                        <PencilIcon /> Edit
                      </button>
                    </td>
                  </tr>,
                  editing?.kind === 'entries' && editing.id === entry.id ? (
                    editRow(`${entry.id}-edit`, 6)
                  ) : null,
                ])}
              </tbody>
            </table>
          )}

          <h3>Totals</h3>
          <p>
            Total office hours: <strong>{formatDuration(officeMs)}</strong>
          </p>
          {[...perProject.entries()].map(([name, ms]) => (
            <p key={name}>
              {name}: <strong>{formatDuration(ms)}</strong>
            </p>
          ))}
        </>
      )}
    </div>
  )
}

export default TimeReview
