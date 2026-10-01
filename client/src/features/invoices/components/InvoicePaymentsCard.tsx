import { METHODS, METHOD_LABELS } from '../constants'
import type { InvoiceDetail } from '../types'

type Props = {
  invoice: InvoiceDetail
  money: (value: number | string) => string
  paymentDate: string
  setPaymentDate: (value: string) => void
  amount: string
  setAmount: (value: string) => void
  method: string
  setMethod: (value: string) => void
  reason: string
  setReason: (value: string) => void
  reference: string
  setReference: (value: string) => void
  paymentError: string
  saving: boolean
  recordPayment: (event: React.FormEvent) => void
}

function InvoicePaymentsCard({
  invoice,
  money,
  paymentDate,
  setPaymentDate,
  amount,
  setAmount,
  method,
  setMethod,
  reason,
  setReason,
  reference,
  setReference,
  paymentError,
  saving,
  recordPayment,
}: Props) {
  return (
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
  )
}

export default InvoicePaymentsCard
