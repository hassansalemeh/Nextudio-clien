import { useEffect, useState } from 'react'
import { getErrorMessage } from '../lib/apiError'
import { CloseIcon } from './icons'
import Spinner from './Spinner'

type Props = {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: (reason: string) => Promise<void>
  onClose: () => void
}



// A confirmation dialog that requires typing a reason before the action runs - used for cancelling a
// receipt or a payment, where the reason is kept as part of the audit trail.
function CancelWithReasonDialog({ title, message, confirmLabel = 'Cancel it', onConfirm, onClose }: Props) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!reason.trim()) return setError('Enter a reason.')
    setBusy(true)
    setError('')
    try {
      await onConfirm(reason.trim())
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong.'))
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="cancel-reason-title">
        <div className="modal-header">
          <h2 id="cancel-reason-title">{title}</h2>
          <button type="button" className="doc-icon" aria-label="Close" disabled={busy} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <p className="modal-message">{message}</p>
          <label className="form-field">
            Reason
            <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being cancelled?" />
          </label>
          {error && <p className="error-message">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-sm btn-ghost" disabled={busy} onClick={onClose}>
              Keep it
            </button>
            <button type="submit" className="btn-sm btn-danger-solid" disabled={busy}>
              {busy && <Spinner />} {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CancelWithReasonDialog
