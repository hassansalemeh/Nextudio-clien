import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL ?? ''

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
}

export const INVOICE_TYPE_LABELS: Record<string, string> = {
  professional_services: 'Professional Services',
  client_funds: 'Client Funds',
}

type Invoice = {
  id: string
  invoice_number: string
  invoice_type: string
  client_name: string
  project_id: string | null
  project_name: string | null
  currency: string
  total: string
  paid: number
  amount_due: number
  status: string
}

function money(amount: number | string, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/api/invoices`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setInvoices)
      .catch(() => setError('Could not load invoices.'))
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
          <p className="empty-state">Loading invoices...</p>
        ) : invoices.length === 0 ? (
          <p className="empty-state">No invoices yet. An invoice is created when an estimate is approved, or directly as a Client Funds invoice.</p>
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
