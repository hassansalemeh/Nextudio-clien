import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { fetchInvoices } from '../api'
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from '../types'
import type { InvoiceListItem } from '../types'

function money(amount: number | string, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

function InvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchInvoices()
      .then(setInvoices)
      .catch((err) => setError(getErrorMessage(err, 'Could not load invoices.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="doc-topbar">
        <h1>Invoices</h1>
        <div className="doc-actions">
          <Link to="/invoices/new" className="btn-pill">
            + New Client Funds Invoice
          </Link>
        </div>
      </div>
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <PageLoader label="Loading invoices..." />
        ) : invoices.length === 0 ? (
          <EmptyState
            message="No invoices yet. An invoice is created when an estimate is approved, or directly as a Client Funds invoice."
            actionLabel="+ New Client Funds Invoice"
            onAction={() => navigate('/invoices/new')}
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Type</th>
                <th>Client</th>
                <th>Project</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Amount Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`/invoices/${invoice.id}`}>{invoice.invoice_number}</Link>
                  </td>
                  <td>
                    <span className={`status-badge ${invoice.invoice_type === 'client_funds' ? 'status-draft' : 'status-approved'}`}>
                      {INVOICE_TYPE_LABELS[invoice.invoice_type] ?? invoice.invoice_type}
                    </span>
                  </td>
                  <td>{invoice.client_name}</td>
                  <td>{invoice.project_id ? <Link to={`/projects/${invoice.project_id}`}>{invoice.project_name}</Link> : '—'}</td>
                  <td>{money(invoice.total, invoice.currency)}</td>
                  <td>{money(invoice.paid, invoice.currency)}</td>
                  <td>{money(invoice.amount_due, invoice.currency)}</td>
                  <td>
                    <span className={`status-badge status-${invoice.status}`}>{INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default InvoicesPage
