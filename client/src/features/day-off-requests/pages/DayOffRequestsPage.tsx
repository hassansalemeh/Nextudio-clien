import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import EmptyState from '../../../shared/components/EmptyState'
import { CheckIcon, CloseIcon } from '../../../shared/components/icons'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import Spinner from '../../../shared/components/Spinner'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { formatLongDate } from '../../../shared/lib/timeUtils'
import { approveDayOffRequest, fetchDayOffRequests, rejectDayOffRequest } from '../api'
import type { DayOffRequest } from '../types'
import styles from '../DayOffRequests.module.css'

const STATUS_LABELS: Record<DayOffRequest['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

function DayOffRequestsPage({ onPendingCountChange }: { onPendingCountChange?: (count: number) => void }) {
  const toast = useToast()
  const { id } = useParams()
  const [requests, setRequests] = useState<DayOffRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const highlightedRow = useRef<HTMLTableRowElement | null>(null)
  const hasScrolled = useRef(false)

  const load = useCallback(async () => {
    try {
      const data = await fetchDayOffRequests()
      setRequests(data)
      onPendingCountChange?.(data.filter((request) => request.status === 'pending').length)
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load day-off requests.'))
    } finally {
      setLoading(false)
    }
  }, [onPendingCountChange])

  useEffect(() => {
    load()
  }, [load])

  // Scroll to and highlight the request this page was opened for (e.g. from a WhatsApp link), once
  useEffect(() => {
    if (!id || hasScrolled.current || !highlightedRow.current) return
    highlightedRow.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    hasScrolled.current = true
  }, [id, requests])

  async function review(request: DayOffRequest, action: 'approve' | 'reject') {
    setError('')
    setBusyId(request.id)
    try {
      await (action === 'approve' ? approveDayOffRequest(request.id) : rejectDayOffRequest(request.id))
      await load()
      toast.success(action === 'approve' ? 'Request approved.' : 'Request rejected.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not update this request.')
      setError(message)
      toast.error(message)
    } finally {
      setBusyId(null)
    }
  }

  const pending = requests.filter((request) => request.status === 'pending')
  const reviewed = requests.filter((request) => request.status !== 'pending')

  function row(request: DayOffRequest) {
    const highlighted = request.id === id
    return (
      <tr key={request.id} ref={highlighted ? highlightedRow : undefined} className={highlighted ? styles.highlighted : undefined}>
        <td data-label="Employee">{request.employee_name}</td>
        <td data-label="Date">{formatLongDate(request.request_date)}</td>
        <td data-label="Reason" className="col-wrap">{request.reason || '—'}</td>
        <td data-label="Status">
          <span className={`status-badge status-${request.status}`}>{STATUS_LABELS[request.status]}</span>
        </td>
        <td data-label="">
          {request.status === 'pending' && (
            <div className="edit-actions">
              <button type="button" className="btn-sm btn-solid" disabled={busyId === request.id} onClick={() => review(request, 'approve')}>
                {busyId === request.id ? <Spinner /> : <CheckIcon />} Approve
              </button>
              <button type="button" className="btn-sm btn-ghost" disabled={busyId === request.id} onClick={() => review(request, 'reject')}>
                {busyId === request.id ? <Spinner /> : <CloseIcon />} Reject
              </button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <>
      <PageHeader title="Day-off requests" description="Review and respond to employees' day-off requests." />
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <PageLoader label="Loading day-off requests..." />
        ) : requests.length === 0 ? (
          <EmptyState message="No day-off requests yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Reason</th>
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
    </>
  )
}

export default DayOffRequestsPage
