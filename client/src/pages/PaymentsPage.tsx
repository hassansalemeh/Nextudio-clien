import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CloseIcon, PencilIcon } from '../components/icons'
import { localDateString } from '../timeUtils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

const METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]
const METHOD_LABELS: Record<string, string> = Object.fromEntries(METHODS.map((m) => [m.value, m.label]))

const REASON_SUGGESTIONS = ['Down payment', 'Concept Design payment', 'Permit phase payment', 'Final payment', 'Other']

type Project = { id: string; name: string }
type InvoiceRow = { id: string; invoice_number: string; invoice_type: string; project_id: string | null; amount_due: number }
type Payment = {
  id: string
  project_id: string
  project_name: string
  client_name: string
  invoice_id: string | null
  invoice_number: string | null
  payment_date: string
  amount: string
  reason: string
  method: string | null
  reference: string | null
  edits: number
}

function PaymentsPage() {
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [editing, setEditing] = useState<Payment | null>(null)
  const [projectId, setProjectId] = useState(searchParams.get('project') ?? '')
  const [paymentDate, setPaymentDate] = useState(localDateString())
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [applyToInvoice, setApplyToInvoice] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [paymentsResponse, invoicesResponse] = await Promise.all([fetch(`${API_URL}/api/payments`), fetch(`${API_URL}/api/invoices`)])
      if (!paymentsResponse.ok || !invoicesResponse.ok) throw new Error('Failed to load')
      setPayments(await paymentsResponse.json())
      setInvoices(await invoicesResponse.json())
      setLoadError('')
    } catch {
      setLoadError('Could not load payments.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetch(`${API_URL}/api/projects`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: Project[]) => setProjects([...data].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setLoadError('Could not load projects.'))
  }, [load])

  // The selected project's Professional Services invoice (a project has at most one), and what is still due on
  // it. Client Funds invoices are paid from the invoice's own page instead, so they're left out of this picker.
  const invoice =
    invoices.find((row) => row.invoice_type === 'professional_services' && row.project_id !== null && String(row.project_id) === projectId) ?? null
  const dueOnInvoice = invoice ? invoice.amount_due + (editing && editing.invoice_id === invoice.id ? Number(editing.amount) : 0) : 0
  const canApply = invoice !== null && dueOnInvoice > 0

  function resetForm() {
    setEditing(null)
    setProjectId('')
    setPaymentDate(localDateString())
    setAmount('')
    setReason('')
    setMethod('')
    setReference('')
    setApplyToInvoice(true)
    setError('')
  }

  function startEdit(payment: Payment) {
    setDone('')
    setError('')
    setEditing(payment)
    setProjectId(payment.project_id)
    setPaymentDate(payment.payment_date)
    setAmount(String(Number(payment.amount)))
    setReason(payment.reason)
    setMethod(payment.method ?? '')
    setReference(payment.reference ?? '')
    setApplyToInvoice(payment.invoice_id !== null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setDone('')

    const value = Number(amount)
    if (!projectId) return setError('Choose a project.')
    if (!paymentDate) return setError('Enter the payment date.')
    if (amount === '' || Number.isNaN(value) || value <= 0) return setError('Enter the amount received (greater than 0).')
    if (!reason.trim()) return setError('Enter a reason, for example "Down payment".')

    setSaving(true)
    try {
      const response = await fetch(`${API_URL}/api/payments${editing ? `/${editing.id}` : ''}`, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          // applied to the project's invoice, so the invoice's paid / due / status update by themselves
          invoice_id: canApply && applyToInvoice ? invoice!.id : null,
          payment_date: paymentDate,
          amount: value,
          reason,
          method: method || null,
          reference,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Could not save the payment.')
      setDone(editing ? 'Payment corrected.' : 'Payment recorded.')
      resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1>Payments</h1>

      <div className="card">
        <h2>{editing ? 'Correct Payment' : 'Add Payment'}</h2>
        <p className="empty-state">Record money received from a client against a project.</p>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <label className="form-field">
              Project
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Payment Date
              <input type="date" value={paymentDate} max={localDateString()} onChange={(e) => setPaymentDate(e.target.value)} />
            </label>
            <label className="form-field">
              Amount Received
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="form-field">
              Reason / Description
              <input list="payment-reasons" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Down payment" />
              <datalist id="payment-reasons">
                {REASON_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="form-grid">
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

          {invoice && (
            <label className="payment-apply">
              <input type="checkbox" checked={canApply && applyToInvoice} disabled={!canApply} onChange={(e) => setApplyToInvoice(e.target.checked)} />
              <span>
                Apply to invoice <strong>{invoice.invoice_number}</strong>{' '}
                {canApply ? `(${usd.format(dueOnInvoice)} due)` : '(already fully paid)'}
              </span>
            </label>
          )}

          <div className="edit-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {editing ? 'Save Correction' : 'Add Payment'}
            </button>
            {editing && (
              <button type="button" className="btn-sm btn-ghost" onClick={resetForm}>
                <CloseIcon /> Cancel
              </button>
            )}
          </div>
          {error && <p className="error-message">{error}</p>}
          {done && <p className="doc-saved">{done}</p>}
        </form>
      </div>

      <div className="card">
        <h2>Payments</h2>
        {loadError && <p className="error-message">{loadError}</p>}
        {loading ? (
          <p className="empty-state">Loading payments...</p>
        ) : payments.length === 0 ? (
          <p className="empty-state">No payments recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Client</th>
                <th>Reason</th>
                <th>Amount</th>
                <th>Method</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.payment_date}</td>
                  <td>
                    <Link to={`/projects/${payment.project_id}`}>{payment.project_name}</Link>
                    {payment.invoice_number && (
                      <div className="stat-note">
                        <Link to={`/invoices/${payment.invoice_id}`}>{payment.invoice_number}</Link>
                      </div>
                    )}
                  </td>
                  <td>{payment.client_name}</td>
                  <td>
                    {payment.reason}
                    {payment.reference && <div className="stat-note">{payment.reference}</div>}
                    {payment.edits > 0 && (
                      <span className="status-badge status-draft" title="This payment was corrected. The earlier values are kept in the history.">
                        Corrected
                      </span>
                    )}
                  </td>
                  <td>{usd.format(Number(payment.amount))}</td>
                  <td>{payment.method ? METHOD_LABELS[payment.method] : '—'}</td>
                  <td>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => startEdit(payment)}>
                      <PencilIcon /> Correct
                    </button>
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

export default PaymentsPage

