import { Link } from 'react-router-dom'
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from '../types'
import type { InvoiceDetail } from '../types'

type Props = {
  invoice: InvoiceDetail
  isClientFunds: boolean
}

function InvoiceDetailsCard({ invoice, isClientFunds }: Props) {
  return (
    <div className="card">
      <h2>Invoice Details</h2>
      <p>
        Type:{' '}
        <span className={`status-badge ${isClientFunds ? 'status-draft' : 'status-approved'}`}>
          {INVOICE_TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type}
        </span>
      </p>
      <p>
        Client: <strong>{invoice.client_name}</strong>
      </p>
      <p>
        Contact person: <strong>{invoice.contact_name || '—'}</strong>
      </p>
      <p>
        Project:{' '}
        {invoice.project_id ? <Link to={`/projects/${invoice.project_id}`}>{invoice.project_name}</Link> : <strong>—</strong>}
      </p>
      <p>
        Title: <strong>{invoice.summary || invoice.title}</strong>
      </p>
      {invoice.project_location && (
        <p>
          Project Location: <strong>{invoice.project_location}</strong>
        </p>
      )}
      {invoice.estimate_id && (
        <p>
          From estimate: <Link to={`/estimates/${invoice.estimate_id}`}>{invoice.estimate_number}</Link>
        </p>
      )}
      <p>
        Invoice date: <strong>{invoice.invoice_date}</strong> · Payment due: <strong>{invoice.due_date || '—'}</strong>
      </p>
      <p>
        Status: <span className={`status-badge status-${invoice.status}`}>{INVOICE_STATUS_LABELS[invoice.status]}</span>
      </p>
    </div>
  )
}

export default InvoiceDetailsCard
