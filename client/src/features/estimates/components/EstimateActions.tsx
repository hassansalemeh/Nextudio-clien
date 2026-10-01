import { useNavigate } from 'react-router-dom'
import { InvoiceIcon, MailIcon, TrashIcon } from '../../../shared/components/icons'
import type { EstimateLinks } from '../types'

type Props = {
  busy: boolean
  isNew: boolean
  locked: boolean
  status: string
  id: string | undefined
  links: EstimateLinks
  onPreview: () => void
  onOpenEmail: () => void
  onDuplicate: () => void
  onSave: () => void
  onConvert: () => void
  onDelete: () => void
}

function EstimateActions({ busy, isNew, locked, status, id, links, onPreview, onOpenEmail, onDuplicate, onSave, onConvert, onDelete }: Props) {
  const navigate = useNavigate()

  return (
    <div className="doc-actions">
      <button type="button" className="btn-outline" onClick={() => navigate('/estimates')}>
        Back
      </button>
      <button type="button" className="btn-outline" disabled={busy} onClick={locked ? () => navigate(`/estimates/${id}/preview`) : onPreview}>
        Preview
      </button>
      {!isNew && (
        <button type="button" className="btn-outline" disabled={busy} onClick={onOpenEmail}>
          <MailIcon /> Send by Email
        </button>
      )}
      {!isNew && (
        <button
          type="button"
          className="btn-outline"
          disabled={busy}
          onClick={onDuplicate}
          title="Create a new, independent estimate starting from this one's content"
        >
          Duplicate
        </button>
      )}
      {!locked && (
        <button type="button" className="btn-pill" disabled={busy} onClick={onSave}>
          Save and continue
        </button>
      )}
      {!isNew && !locked && status !== 'rejected' && (
        <button type="button" className="btn-convert" disabled={busy} onClick={onConvert} title="Use this when the client has approved the quotation">
          <InvoiceIcon /> Convert to Invoice
        </button>
      )}
      {locked && links.invoice_id && (
        <button type="button" className="btn-convert" onClick={() => navigate(`/invoices/${links.invoice_id}`)}>
          <InvoiceIcon /> View Invoice
        </button>
      )}
      {!isNew && (
        <button type="button" className="btn-outline btn-outline-danger" disabled={busy} onClick={onDelete} title="Permanently delete this estimate">
          <TrashIcon /> Delete
        </button>
      )}
    </div>
  )
}

export default EstimateActions
