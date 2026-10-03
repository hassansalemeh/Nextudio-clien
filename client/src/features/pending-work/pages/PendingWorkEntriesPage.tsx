import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { CheckIcon, CloseIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { durationMs, formatDuration, formatTime, localDateString } from '../../../shared/lib/timeUtils'
import { approvePendingWorkEntry, fetchPendingWorkEntries, rejectPendingWorkEntry } from '../api'
import type { PendingEntry } from '../types'

// Manual work entries an employee added for a project they weren't yet assigned to on that date.
// They never count toward hours, labor cost, Financial Summary or the Dashboard until an admin approves them.
function PendingWorkEntriesPage({ onPendingCountChange }: { onPendingCountChange?: (count: number) => void }) {
  const toast = useToast()
  const [entries, setEntries] = useState<PendingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const [approving, setApproving] = useState<PendingEntry | null>(null)
  const [assignStart, setAssignStart] = useState('')
  const [assignEnd, setAssignEnd] = useState('')
  const [assignDescription, setAssignDescription] = useState('')
  const [approveError, setApproveError] = useState('')

  const load = useCallback(async () => {
    try {
      const loadedEntries = await fetchPendingWorkEntries()
      setEntries(loadedEntries)
      onPendingCountChange?.(loadedEntries.filter((entry) => entry.status === 'pending').length)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load pending work entries.'))
    } finally {
      setLoading(false)
    }
  }, [onPendingCountChange])

  useEffect(() => {
    load()
  }, [load])

  function openApprove(entry: PendingEntry) {
    setError('')
    setApproveError('')
    setApproving(entry)
    // Pre-filled with the work-entry date; the admin can extend the end date if the employee is expected to continue
    const date = localDateString(new Date(entry.started_at))
    setAssignStart(date)
    setAssignEnd(date)
    setAssignDescription(entry.description)
  }

  async function reject(entry: PendingEntry) {
    setError('')
    setBusyId(entry.id)
    try {
      await rejectPendingWorkEntry(entry.id)
      await load()
      toast.success('Entry rejected.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not reject this request.')
      setError(message)
      toast.error(message)
    } finally {
      setBusyId(null)
    }
  }

  async function confirmApprove() {
    if (!approving) return
    setApproveError('')
    if (!assignStart) return setApproveError('Assignment start date is required.')
    if (!assignEnd) return setApproveError('Assignment end date is required.')
    if (assignEnd < assignStart) return setApproveError('End date cannot be before start date.')
    if (!assignDescription.trim()) return setApproveError('Task description is required.')

    setBusyId(approving.id)
    try {
      await approvePendingWorkEntry(approving.id, { start_date: assignStart, end_date: assignEnd, description: assignDescription.trim() })
      setApproving(null)
      await load()
      toast.success('Entry approved.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not approve this request.')
      setApproveError(message)
      toast.error(message)
    } finally {
      setBusyId(null)
    }
  }

  const pending = entries.filter((entry) => entry.status === 'pending')
  const reviewed = entries.filter((entry) => entry.status !== 'pending')

  function row(entry: PendingEntry) {
    return (
      <tr key={entry.id}>
        <td data-label="Employee">{entry.employee_name}</td>
        <td data-label="Project">{entry.project_name}</td>
        <td data-label="Date">{localDateString(new Date(entry.started_at))}</td>
        <td data-label="Start">{formatTime(entry.started_at)}</td>
        <td data-label="End">{formatTime(entry.ended_at)}</td>
        <td data-label="Duration">{formatDuration(durationMs(entry.started_at, entry.ended_at))}</td>
        <td data-label="Description" className="col-wrap">{entry.description}</td>
        <td data-label="Status">
          <span className={`status-badge status-${entry.status}`}>{entry.status === 'pending' ? 'Pending' : 'Rejected'}</span>
        </td>
        <td data-label="">
          {entry.status === 'pending' && (
            <div className="edit-actions">
              <button
                type="button"
                className="btn-sm btn-solid"
                disabled={busyId === entry.id}
                onClick={() => openApprove(entry)}
              >
                <CheckIcon /> Approve & Assign
              </button>
              <button type="button" className="btn-sm btn-ghost" disabled={busyId === entry.id} onClick={() => reject(entry)}>
                {busyId === entry.id ? <Spinner /> : <CloseIcon />} Reject
              </button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <>
      <PageHeader title="Approvals" description="Review work added outside assignments before it counts toward project costs." />

      <div className="card">
        <p className="empty-state">
          Manual work entries added for a project the employee wasn't yet assigned to on that date. They don't count
          toward hours or labor cost anywhere until you approve them.
        </p>
        {error && <p className="error-message">{error}</p>}

        {loading ? (
          <PageLoader label="Loading pending work entries..." />
        ) : entries.length === 0 ? (
          <EmptyState message="Nothing waiting for review." />
        ) : (
          <table className="data-table pending-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Project</th>
                <th>Date</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th>Description</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map(row)}
              {reviewed.map(row)}
            </tbody>
          </table>
        )}
      </div>

      {approving && (
        <div className="card">
          <h2>Approve & Assign</h2>
          <p>
            Employee: <strong>{approving.employee_name}</strong>
            <br />
            Project: <strong>{approving.project_name}</strong>
          </p>
          <div className="form-grid">
            <label className="form-field">
              Assignment Start Date
              <input type="date" value={assignStart} onChange={(e) => setAssignStart(e.target.value)} />
            </label>
            <label className="form-field">
              Assignment End Date
              <input type="date" value={assignEnd} min={assignStart || undefined} onChange={(e) => setAssignEnd(e.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Task Description
              <textarea value={assignDescription} onChange={(e) => setAssignDescription(e.target.value)} />
            </label>
          </div>
          <p className="empty-state">
            If {approving.employee_name} is already assigned to {approving.project_name} on that date, this just
            approves the entry — no duplicate assignment is created.
          </p>
          <div className="edit-actions">
            <button type="button" className="btn-sm btn-solid" disabled={busyId === approving.id} onClick={confirmApprove}>
              {busyId === approving.id ? <Spinner /> : <CheckIcon />} Confirm
            </button>
            <button type="button" className="btn-sm btn-ghost" disabled={busyId === approving.id} onClick={() => setApproving(null)}>
              <CloseIcon /> Cancel
            </button>
          </div>
          {approveError && <p className="error-message">{approveError}</p>}
        </div>
      )}
    </>
  )
}

export default PendingWorkEntriesPage
