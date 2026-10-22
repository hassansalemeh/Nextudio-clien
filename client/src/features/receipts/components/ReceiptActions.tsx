import { useNavigate } from 'react-router-dom'
import { MailIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'

type Props = {
  busy: boolean
  isNew: boolean
  cancelled: boolean
  onPreview: () => void
  onOpenEmail: () => void
  onSave: () => void
  onCancel: () => void
}

function ReceiptActions({ busy, isNew, cancelled, onPreview, onOpenEmail, onSave, onCancel }: Props) {
  const navigate = useNavigate()

  return (
    <div className="doc-actions">
      <button type="button" className="btn-outline" onClick={() => navigate('/receipts')}>
        Back
      </button>
      <button type="button" className="btn-outline" disabled={busy} onClick={onPreview}>
        {busy && <Spinner />} Preview
      </button>
      {!isNew && (
        <button type="button" className="btn-outline" disabled={busy} onClick={onOpenEmail}>
          <MailIcon /> Send by Email
        </button>
      )}
      {!isNew && !cancelled && (
        <button type="button" className="btn-danger" disabled={busy} onClick={onCancel}>
          Cancel receipt
        </button>
      )}
      {!cancelled && (
        <button type="button" className="btn-pill" disabled={busy} onClick={onSave}>
          {busy && <Spinner />} Save and continue
        </button>
      )}
    </div>
  )
}

export default ReceiptActions
