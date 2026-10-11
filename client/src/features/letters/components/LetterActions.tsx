import { useNavigate } from 'react-router-dom'
import { MailIcon, TrashIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'

type Props = {
  busy: boolean
  isNew: boolean
  onPreview: () => void
  onOpenEmail: () => void
  onSave: () => void
  onDelete: () => void
}

function LetterActions({ busy, isNew, onPreview, onOpenEmail, onSave, onDelete }: Props) {
  const navigate = useNavigate()

  return (
    <div className="doc-actions">
      <button type="button" className="btn-outline" onClick={() => navigate('/letters')}>
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
      <button type="button" className="btn-pill" disabled={busy} onClick={onSave}>
        {busy && <Spinner />} Save and continue
      </button>
      {!isNew && (
        <button type="button" className="btn-outline btn-outline-danger" disabled={busy} onClick={onDelete} title="Permanently delete this letter">
          {busy ? <Spinner /> : <TrashIcon />} Delete
        </button>
      )}
    </div>
  )
}

export default LetterActions
