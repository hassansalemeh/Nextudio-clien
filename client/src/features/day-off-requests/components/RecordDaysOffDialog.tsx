import { useState } from 'react'
import { CloseIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { formatLongDate } from '../../../shared/lib/timeUtils'
import { recordDaysOff } from '../api'
import type { RecordDaysOffResult } from '../types'

type Props = {
  employeeId: string
  employeeName: string
  onClose: () => void
  onRecorded: () => void
}

// Admin recording that a staff member was off, including past dates - one row per weekday in the
// range, as paid or unpaid. The server skips any date that already has a non-rejected day off and
// reports which ones, rather than failing the whole range.
function RecordDaysOffDialog({ employeeId, employeeName, onClose, onRecorded }: Props) {
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [isPaid, setIsPaid] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RecordDaysOffResult | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!from || !to) return setError('Choose both a from and a to date.')
    if (to < from) return setError('The to date must be on or after the from date.')

    setBusy(true)
    try {
      const data = await recordDaysOff(employeeId, from, to, isPaid)
      setResult(data)
      onRecorded()
      if (data.skipped.length === 0) {
        toast.success(`Recorded ${data.created.length} day(s) off.`)
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Could not record the days off.')
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="record-days-off-result-title">
          <div className="modal-header">
            <h2 id="record-days-off-result-title">Days off recorded</h2>
          </div>
          <p className="doc-hint">
            Recorded {result.created.length} day{result.created.length === 1 ? '' : 's'} off for {employeeName}
            {result.created.length > 0 ? ` (${isPaid ? 'paid' : 'unpaid'})` : ''}.
          </p>
          {result.skipped.length > 0 && (
            <p className="doc-hint">
              Skipped (already had a day off): {result.skipped.map((date) => formatLongDate(date)).join(', ')}
            </p>
          )}
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-sm btn-solid" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="record-days-off-title">
        <div className="modal-header">
          <h2 id="record-days-off-title">Record a day off for {employeeName}</h2>
          <button type="button" className="doc-icon" aria-label="Close" onClick={onClose} disabled={busy}>
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <label className="form-field">
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="form-field">
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label className="form-field">
              Paid or unpaid
              <select value={isPaid ? 'paid' : 'unpaid'} onChange={(e) => setIsPaid(e.target.value === 'paid')}>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </label>
          </div>
          <p className="empty-state">Weekends in the range are skipped automatically. A date that already has a day off is skipped too.</p>

          {error && <p className="error-message">{error}</p>}

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-sm btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-sm btn-solid" disabled={busy}>
              {busy && <Spinner />} Record day(s) off
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RecordDaysOffDialog
