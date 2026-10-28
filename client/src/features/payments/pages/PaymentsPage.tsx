import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import CancelWithReasonDialog from '../../../shared/components/CancelWithReasonDialog'
import { CloseIcon, PencilIcon, PlusIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { localDateString } from '../../../shared/lib/timeUtils'
import { cancelPayment, fetchPaymentsAndInvoices, fetchProjectsForPayments, savePayment } from '../api'
import type { InvoiceRow, Payment, Project } from '../types'

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

function PaymentsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [editing, setEditing] = useState<Payment | null>(null)
  const [formOpen, setFormOpen] = useState(Boolean(searchParams.get('project')))
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
  const [cancelTarget, setCancelTarget] = useState<Payment | null>(null)

  const load = useCallback(async () => {
    try {
      const { payments, invoices } = await fetchPaymentsAndInvoices()
      setPayments(payments)
      setInvoices(invoices)
      setLoadError('')
    } catch (err) {
      setLoadError(getErrorMessage(err, 'Could not load payments.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    fetchProjectsForPayments()
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: Project[]) => setProjects([...data].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((err) => setLoadError(getErrorMessage(err, 'Could not load projects.')))
  }, [load])

  // The selected project's Professional Services invoice (a project has at most one), and what is still due on
  // it. Client Funds invoices are paid from the invoice's own page instead, so they're left out of this picker.
  const invoice =
    invoices.find((row) => row.invoice_type === 'professional_services' && row.project_id !== null && String(row.project_id) === projectId) ?? null
  const dueOnInvoice = invoice ? invoice.amount_due + (editing && editing.invoice_id === invoice.id ? Number(editing.amount) : 0) : 0
  const canApply = invoice !== null && dueOnInvoice > 0

  function resetForm() {
    setEditing(null)
    setFormOpen(false)
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
    if (payment.cancelled_at) {
      const message = 'This payment is cancelled and can no longer be corrected.'
      setError(message)
      toast.error(message)
      return
    }
    if (payment.receipt_number) {
      const message = `This payment has receipt ${payment.receipt_number}. Cancel the receipt to correct it.`
      setError(message)
      toast.error(message)
      return
    }
    setDone('')
    setError('')
    setEditing(payment)
    setFormOpen(true)
    setProjectId(payment.project_id)
    setPaymentDate(payment.payment_date)
    setAmount(String(Number(payment.amount)))
    setReason(payment.reason)
    setMethod(payment.method ?? '')
    setReference(payment.reference ?? '')
    setApplyToInvoice(payment.invoice_id !== null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Clicking a payment opens its receipt when it has one (nothing to correct there directly); otherwise
  // it starts the correction form, which is where the "has a receipt" error still applies.
  function openPayment(payment: Payment) {
    if (payment.receipt_number) {
      navigate(`/receipts/${payment.receipt_id}`)
      return
    }
    startEdit(payment)
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
      await savePayment(editing ? editing.id : null, {
        project_id: projectId,
        // applied to the project's invoice, so the invoice's paid / due / status update by themselves
        invoice_id: canApply && applyToInvoice ? invoice!.id : null,
        payment_date: paymentDate,
        amount: value,
        reason,
        method: method || null,
        reference,
      })
      const message = editing ? 'Payment corrected.' : 'Payment recorded.'
      setDone(message)
      toast.success(message)
      resetForm()
      await load()
    } catch (err) {
      const message = getErrorMessage(err, 'Could not save the payment.')
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelPayment(reason: string) {
    if (!cancelTarget) return
    await cancelPayment(cancelTarget.id, reason)
    setCancelTarget(null)
    toast.success('Payment cancelled.')
    await load()
  }

  return (
    <>
      <PageHeader
        title="Payments"
        description="Record money received from clients and see where it was applied. Select a payment to correct it."
        action={<button type="button" className="btn-primary header-action" aria-expanded={formOpen} aria-controls="payment-entry" onClick={() => formOpen ? resetForm() : setFormOpen(true)}>
          {formOpen ? <CloseIcon /> : <PlusIcon />} {formOpen ? 'Close form' : 'Add Payment'}
        </button>}
      />

      {formOpen && <div className="card entry-panel" id="payment-entry">
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
              {saving && <Spinner />} {editing ? 'Save Correction' : 'Add Payment'}
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
      </div>}

      <div className="card">
        <h2>Payments</h2>
        {loadError && <p className="error-message">{loadError}</p>}
        {loading ? (
          <PageLoader label="Loading payments..." />
        ) : payments.length === 0 ? (
          <EmptyState message="No payments recorded yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Client</th>
                <th>Reason</th>
                <th className="num">Amount</th>
                <th>Method</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  className={'clickable-row' + (payment.cancelled_at ? ' row-cancelled' : '')}
                  onClick={() => openPayment(payment)}
                >
                  <td data-label="Date"><button type="button" className="row-main-button" onClick={(event) => { event.stopPropagation(); openPayment(payment) }}>{payment.payment_date}</button></td>
                  <td data-label="Project">
                    <Link to={`/projects/${payment.project_id}`} onClick={(event) => event.stopPropagation()}>{payment.project_name}</Link>
                    {payment.invoice_number && (
                      <div className="stat-note">
                        <Link to={`/invoices/${payment.invoice_id}`} onClick={(event) => event.stopPropagation()}>{payment.invoice_number}</Link>
                      </div>
                    )}
                  </td>
                  <td data-label="Client">{payment.client_name}</td>
                  <td data-label="Reason">
                    {payment.reason}
                    {payment.reference && <div className="stat-note">{payment.reference}</div>}
                    {payment.edits > 0 && (
                      <span className="status-badge status-draft" title="This payment was corrected. The earlier values are kept in the history.">
                        Corrected
                      </span>
                    )}
                    {payment.cancelled_at && (
                      <span className="status-badge status-rejected" title={payment.cancel_reason ?? ''}>
                        Cancelled
                      </span>
                    )}
                    {payment.receipt_number && (
                      <div className="stat-note">
                        Receipt: <Link to={`/receipts/${payment.receipt_id}`} onClick={(event) => event.stopPropagation()}>{payment.receipt_number}</Link>
                      </div>
                    )}
                  </td>
                  <td data-label="Amount" className="num">{usd.format(Number(payment.amount))}</td>
                  <td data-label="Method">{payment.method ? METHOD_LABELS[payment.method] : '—'}</td>
                  <td data-label="Actions">
                    {payment.cancelled_at ? null : payment.receipt_number ? (
                      <span className="status-badge" title="This payment has a receipt. Cancel the receipt to correct it.">
                        Has receipt
                      </span>
                    ) : (
                      <>
                        <button type="button" className="btn-sm btn-ghost" onClick={(event) => { event.stopPropagation(); startEdit(payment) }}>
                          <PencilIcon /> Correct
                        </button>
                        <Link
                          to={`/receipts/new?payment_id=${payment.id}`}
                          className="btn-sm btn-ghost"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Create receipt
                        </Link>
                        <button
                          type="button"
                          className="btn-sm btn-ghost"
                          onClick={(event) => { event.stopPropagation(); setCancelTarget(payment) }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {cancelTarget && (
        <CancelWithReasonDialog
          title="Cancel this payment?"
          message={`This cancels the ${usd.format(Number(cancelTarget.amount))} payment on ${cancelTarget.payment_date}. It can't be edited afterwards.`}
          confirmLabel="Cancel payment"
          onConfirm={handleCancelPayment}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </>
  )
}

export default PaymentsPage

