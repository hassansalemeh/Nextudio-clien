import Spinner from '../../../shared/components/Spinner'
import EmptyState from '../../../shared/components/EmptyState'
import { DISBURSEMENT_CATEGORY_SUGGESTIONS } from '../constants'
import type { Disbursement, InvoiceDetail } from '../types'

type Props = {
  invoice: InvoiceDetail
  disbursements: Disbursement[]
  money: (value: number | string) => string
  fundsSpent: number
  dDate: string
  setDDate: (value: string) => void
  dPayee: string
  setDPayee: (value: string) => void
  dDescription: string
  setDDescription: (value: string) => void
  dCategory: string
  setDCategory: (value: string) => void
  dAmount: string
  setDAmount: (value: string) => void
  dReference: string
  setDReference: (value: string) => void
  dError: string
  dSaving: boolean
  addDisbursement: (event: React.FormEvent) => void
  deleteDisbursement: (id: string) => void
}

function InvoiceDisbursementsCard({
  invoice,
  disbursements,
  money,
  fundsSpent,
  dDate,
  setDDate,
  dPayee,
  setDPayee,
  dDescription,
  setDDescription,
  dCategory,
  setDCategory,
  dAmount,
  setDAmount,
  dReference,
  setDReference,
  dError,
  dSaving,
  addDisbursement,
  deleteDisbursement,
}: Props) {
  return (
    <div className="card">
      <h2>Disbursements / Project Expenses</h2>
      <div className="inv-totals" style={{ marginBottom: '1.25rem' }}>
        <div>Funds Received</div>
        <div>{money(invoice.paid)}</div>
        <div>Funds Spent</div>
        <div>{money(fundsSpent)}</div>
        <div>
          <strong>Funds Remaining</strong>
        </div>
        <div>
          <strong>{money(invoice.paid - fundsSpent)}</strong>
        </div>
      </div>

      {disbursements.length === 0 ? (
        <EmptyState message="No disbursements recorded yet." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee / Supplier / Worker</th>
              <th>Description</th>
              <th>Category</th>
              <th>Reference</th>
              <th className="num">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {disbursements.map((d) => (
              <tr key={d.id}>
                <td data-label="Date">{d.disbursement_date}</td>
                <td data-label="Payee">{d.payee}</td>
                <td data-label="Description" className="col-wrap">{d.description || '—'}</td>
                <td data-label="Category">{d.category || '—'}</td>
                <td data-label="Reference">{d.reference || '—'}</td>
                <td data-label="Amount" className="num">{money(d.amount)}</td>
                <td data-label="Actions">
                  <button type="button" className="btn-sm btn-ghost" onClick={() => deleteDisbursement(d.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={addDisbursement} noValidate style={{ marginTop: '1.25rem' }}>
        <h2>Record Disbursement</h2>
        <div className="form-grid">
          <label className="form-field">
            Date
            <input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} />
          </label>
          <label className="form-field">
            Payee / Supplier / Worker
            <input value={dPayee} onChange={(e) => setDPayee(e.target.value)} placeholder="e.g. ABC Contracting" />
          </label>
          <label className="form-field">
            Category (optional)
            <input
              list="disbursement-categories"
              value={dCategory}
              onChange={(e) => setDCategory(e.target.value)}
              placeholder="e.g. Contractor payment"
            />
            <datalist id="disbursement-categories">
              {DISBURSEMENT_CATEGORY_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </label>
          <label className="form-field">
            Amount
            <input type="number" min="0" step="0.01" value={dAmount} onChange={(e) => setDAmount(e.target.value)} />
          </label>
          <label className="form-field">
            Reference / Receipt Number (optional)
            <input value={dReference} onChange={(e) => setDReference(e.target.value)} />
          </label>
        </div>
        <label className="form-field">
          Description (optional)
          <input value={dDescription} onChange={(e) => setDDescription(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={dSaving}>
          {dSaving && <Spinner />} Record Disbursement
        </button>
        {dError && <p className="error-message">{dError}</p>}
      </form>
    </div>
  )
}

export default InvoiceDisbursementsCard
