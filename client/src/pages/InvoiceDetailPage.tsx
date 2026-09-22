import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { localDateString } from '../timeUtils'
import { INVOICE_STATUS_LABELS } from './InvoicesPage'

const API_URL = import.meta.env.VITE_API_URL ?? ''

const UNIT_LABELS: Record<string, string> = { sqm: 'sqm', lm: 'lm', ls: 'ls', pc: 'pc', m3: 'm³', sheet: 'sheet' }

const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

const METHOD_LABELS: Record<string, string> = Object.fromEntries(METHODS.map((m) => [m.value, m.label]))

type Invoice = {
  id: string
  invoice_number: string
  client_name: string
  contact_name: string | null
  title: string
  summary: string | null
  invoice_date: string
  due_date: string | null
  currency: string
  notes: string | null
  payment_terms: string | null
  timeline: string | null
  exclusions: string | null
  project_location: string | null
  introduction: string | null
  subtotal: string
  discount_type: string
  discount_value: string
  discount: string
  total: string
  estimate_id: string | null
  estimate_number: string | null
  project_id: string | null
  project_name: string | null
  paid: number
  amount_due: number
  status: string
  items: { id: string; name: string; description: string | null; quantity: string; unit: string; unit_price: string; amount: string }[]
  payments: { id: string; payment_date: string; amount: string; reason: string; method: string | null; reference: string | null }[]
}

function InvoiceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [error, setError] = useState('')

  const [paymentDate, setPaymentDate] = useState(localDateString())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [reason, setReason] = useState('Payment')
  const [reference, setReference] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    fetch(`${API_URL}/api/invoices/${id}`)
      .then(async (response) => {
        if (response.status === 404) throw new Error('Invoice not found.')
        if (!response.ok) throw new Error('Could not load invoice.')
        return response.json()
      })
      .then((data) => {
        setInvoice(data)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load invoice.'))
  }, [id])

  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  async function recordPayment(event: React.FormEvent) {
    event.preventDefault()
    setPaymentError('')
    const value = Number(amount)
    if (!paymentDate) return setPaymentError('Payment date is required.')
    if (amount === '' || Number.isNaN(value) || value <= 0) return setPaymentError('Enter a payment amount greater than 0.')
    if (!reason.trim()) return setPaymentError('Enter a reason for the payment.')
    if (!invoice?.project_id) return setPaymentError('This invoice is not linked to a project yet.')

    setSaving(true)
    try {
      // the same payment record the Payments page creates: it belongs to the project and is applied to this invoice
      const response = await fetch(`${API_URL}/api/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: invoice.project_id,
          invoice_id: invoice.id,
          payment_date: paymentDate,
          amount: value,
          reason,
          method: method || null,
          reference,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Could not record the payment.')
      load()
      setAmount('')
      setReference('')
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Could not record the payment.')
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <>
        <p>
          <Link to="/invoices">← Back to Invoices</Link>
        </p>
        <p className="error-message">{error}</p>
      </>
    )
  }
  if (!invoice) return <p className="empty-state">Loading invoice...</p>

  const money = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(Number(value))
  const hasDiscount = Number(invoice.discount) > 0

  return (
    <>
      <div className="doc-topbar">
        <h1>Invoice {invoice.invoice_number}</h1>
        <div className="doc-actions">
          <button type="button" className="btn-outline" onClick={() => navigate('/invoices')}>
            Back
          </button>
          <button type="button" className="btn-pill" onClick={() => navigate(`/invoices/${invoice.id}/preview`)}>
            Preview / PDF
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Invoice Details</h2>
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

      <div className="card">
        <h2>Services</h2>
        {invoice.introduction && (
          <div className="terms-view" style={{ marginTop: 0, marginBottom: '1rem' }}>
            <div className="terms-text">{invoice.introduction}</div>
          </div>
        )}
        <table className="data-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Unit Price</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td className="col-wrap">
                  <strong>{item.name}</strong>
                  {item.description && <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.25rem' }}>{item.description}</div>}
                </td>
                <td>{Number(item.quantity)}</td>
                <td>{UNIT_LABELS[item.unit] ?? item.unit}</td>
                <td>{money(item.unit_price)}</td>
                <td>{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="inv-totals">
          <div>Subtotal</div>
          <div>{money(invoice.subtotal)}</div>
          {hasDiscount && (
            <>
              <div>{invoice.discount_type === 'percent' ? `Discount (${Number(invoice.discount_value)}%)` : 'Discount'}</div>
              <div>({money(invoice.discount)})</div>
            </>
          )}
          <div>
            <strong>Invoice Total</strong>
          </div>
          <div>
            <strong>{money(invoice.total)}</strong>
          </div>
          <div>Amount Paid</div>
          <div>{money(invoice.paid)}</div>
          <div>
            <strong>Amount Due</strong>
          </div>
          <div>
            <strong>{money(invoice.amount_due)}</strong>
          </div>
        </div>
        {[
          { title: 'Payment Terms', text: invoice.payment_terms },
          { title: 'Timeline', text: invoice.timeline },
          { title: 'Notes', text: invoice.notes },
          { title: 'Exclusions', text: invoice.exclusions },
        ]
          .filter((section) => section.text && section.text.trim())
          .map((section) => (
            <div key={section.title} className="terms-view">
              <h3>{section.title}</h3>
              <div className="terms-text">{section.text}</div>
            </div>
          ))}
      </div>

      <div className="card">
        <h2>Payments</h2>
        {invoice.payments.length === 0 ? (
          <p className="empty-state">No payments recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Method</th>
                <th>Reference / Note</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.payment_date}</td>
                  <td>{payment.reason}</td>
                  <td>{payment.method ? (METHOD_LABELS[payment.method] ?? payment.method) : '—'}</td>
                  <td>{payment.reference || '—'}</td>
                  <td>{money(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {invoice.amount_due > 0 ? (
          <form onSubmit={recordPayment} noValidate style={{ marginTop: '1.25rem' }}>
            <h2>Record Payment</h2>
            <div className="form-grid">
              <label className="form-field">
                Payment Date
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </label>
              <label className="form-field">
                Amount
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label className="form-field">
                Reason
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <label className="form-field">
                Payment Method (optional)
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="">Not specified</option>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Reference / Note (optional)
                <input value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
            </div>
            <button type="submit" className="btn-primary" disabled={saving}>
              Record Payment
            </button>
            {paymentError && <p className="error-message">{paymentError}</p>}
            <p className="empty-state">Payments are recorded once: they also appear on the Payments page and on the project.</p>
          </form>
        ) : (
          <p className="empty-state">This invoice is fully paid.</p>
        )}
      </div>
    </>
  )
}

export default InvoiceDetailPage
