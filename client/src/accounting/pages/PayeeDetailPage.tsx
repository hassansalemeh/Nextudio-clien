import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { COUNTERPARTY_KIND_LABELS, DIRECTION_LABELS, fetchJson, money } from '../format'

type PayeeStatement = {
  counterparty: { id: string; name: string; kind: string }
  paid: number
  received: number
  by_project: { project_id: string; project_name: string; paid: number; received: number }[]
  history: {
    id: string
    direction: string
    transaction_date: string
    amount: number
    description: string | null
    status: string
    project_name: string | null
    category_name: string | null
    cash_account_name: string | null
    reversed_by_transaction_id: string | null
  }[]
}

function PayeeDetailPage() {
  const { id } = useParams()
  const { book, loading: bookLoading } = useAccountingBook()
  const [statement, setStatement] = useState<PayeeStatement | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    fetchJson(`/api/accounting/reports/payee-statement?counterparty_id=${id}`)
      .then(setStatement)
      .catch(() => setError('Could not load this payee.'))
  }, [id])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  if (error) {
    return (
      <>
        <p>
          <Link to="/accounting/payees">← Back to Payees</Link>
        </p>
        <p className="error-message">{error}</p>
      </>
    )
  }

  if (!statement) {
    return <p className="empty-state">Loading...</p>
  }

  const currency = book.currency_code

  return (
    <>
      <p>
        <Link to="/accounting/payees">← Back to Payees</Link>
      </p>
      <h1>{statement.counterparty.name}</h1>
      <p className="empty-state" style={{ marginTop: 0 }}>{COUNTERPARTY_KIND_LABELS[statement.counterparty.kind] ?? statement.counterparty.kind}</p>

      <div className="accounting-stat-row">
        <div className="accounting-stat">
          <div className="accounting-stat-label">Total Paid</div>
          <div className="accounting-stat-value">{money(statement.paid, currency)}</div>
        </div>
        <div className="accounting-stat">
          <div className="accounting-stat-label">Total Received</div>
          <div className="accounting-stat-value">{money(statement.received, currency)}</div>
        </div>
      </div>

      {statement.by_project.length > 0 && (
        <div className="card">
          <h2>By Project</h2>
          {statement.by_project.map((row) => (
            <div key={row.project_id} className="accounting-breakdown-row">
              <span>{row.project_name}</span>
              <span>{money(row.paid, currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>Payment History</h2>
        {statement.history.length === 0 ? (
          <p className="empty-state">No transactions yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Project</th>
                <th>Category / Purpose</th>
                <th>Cash Account</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {statement.history.map((row) => (
                <tr key={row.id}>
                  <td>{row.transaction_date}</td>
                  <td>{DIRECTION_LABELS[row.direction]}</td>
                  <td>{row.project_name || '—'}</td>
                  <td>{row.category_name || '—'}</td>
                  <td>{row.cash_account_name || '—'}</td>
                  <td>{money(row.amount, currency)}</td>
                  <td>{row.reversed_by_transaction_id && <span className="status-badge status-inactive">Reversed</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default PayeeDetailPage
