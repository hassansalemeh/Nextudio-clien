import { useState } from 'react'
import { CloseIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { dayOfWeek, localDateString } from '../../../shared/lib/timeUtils'
import { createDayOffRequest } from '../api'
import type { CreatedDayOffRequest } from '../types'
import NotifyWhatsAppStep from './NotifyWhatsAppStep'

type Props = {
  onClose: () => void
  onSubmitted: () => void
}

function isWeekend(dateString: string) {
  const weekday = dayOfWeek(dateString)
  return weekday === 0 || weekday === 6
}

// Date/weekend/duplicate checks here are a fast, friendly first pass - the server re-validates
// everything (and is the source of truth for "duplicate", since it knows the employee's existing requests).
function RequestDayOffDialog({ onClose, onSubmitted }: Props) {
  const toast = useToast()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedDayOffRequest | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!date) return setError('Choose a date.')
    if (date < localDateString()) return setError('Choose a date that is not in the past.')
    if (isWeekend(date)) return setError('Weekends cannot be requested off.')

    setBusy(true)
    try {
      const result = await createDayOffRequest(date, reason)
      setCreated(result)
      onSubmitted()
    } catch (err) {
      const message = getErrorMessage(err, 'Could not submit the request.')
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return <NotifyWhatsAppStep request={created} onClose={onClose} />
  }

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="request-day-off-title">
        <div className="modal-header">
          <h2 id="request-day-off-title">Request a day off</h2>
          <button type="button" className="doc-icon" aria-label="Close" onClick={onClose} disabled={busy}>
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <label className="form-field">
              Date
              <input type="date" min={localDateString()} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Reason (optional)
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family event" />
            </label>
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-sm btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-sm btn-solid" disabled={busy}>
              {busy && <Spinner />} Submit request
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RequestDayOffDialog
