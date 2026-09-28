import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { DIRECTION_LABELS, fetchJson, money } from '../format'

type Statement = {
  project: { id: string; name: string }
  received: number
  paid: number
  fund_balances: { id: string; name: string; balance: number }[]
  spend_by_category: { account_id: string; account_name: string; amount: number }[]
  spend_by_payee: { counterparty_id: string; counterparty_name: string; amount: number }[]
  history: {
    id: string
    direction: string
    transaction_date: string
    amount: number
    description: string | null
    status: string
    counterparty_id: string | null
    counterparty_name: string | null
    category_name: string | null
    cash_account_name: string | null
    reversed_by_transaction_id: string | null
  }[]
}

function AccountingProjectDetailPage() {
  const { id } = useParams()
  const { book, loading: bookLoading } = useAccountingBook()
  const [statement, setStatement] = useState<Statement | null>(null)
  const [error, setError] = useState('')

  const [payeeFilter, setPayeeFilter] = useState('')
  const [cashAccountFilter, setCashAccountFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (!id) return
    fetchJson(`/api/accounting/reports/project-statement?project_id=${id}`)
      .then(setStatement)
      .catch(() => setError('Could not load this project.'))
  }, [id])

  const filteredHistory = useMemo(() => {
    if (!statement) return []
    return statement.history.filter((row) => {
      if (payeeFilter && row.counterparty_name !== payeeFilter) return false
      if (cashAccountFilter && row.cash_account_name !== cashAccountFilter) return false
      if (dateFrom && row.transaction_date < dateFrom) return false
      if (dateTo && row.transaction_date > dateTo) return false
      return true
    })
  }, [statement, payeeFilter, cashAccountFilter, dateFrom, dateTo])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  if (error) {
    return (
      <>
        <p>
          <Link to="/accounting/projects">← Back to Projects</Link>
        </p>
        <p className="error-message">{error}</p>
      </>
    )
  }

  if (!statement) {
    return <p className="empty-state">Loading...</p>
  }

  const currency = book.currency_code
  const cashAccountNames = Array.from(new Set(statement.history.map((row) => row.cash_account_name).filter(Boolean))) as string[]
  const payeeNames = Array.from(new Set(statement.history.map((row) => row.counterparty_name).filter(Boolean))) as string[]

  return (
    <>
      <p>
        <Link to="/accounting/projects">← Back to Projects</Link>
      </p>
      <h1>{statement.project.name}</h1>

      <div className="accounting-stat-row">
        <div className="accounting-stat">
          <div className="accounting-stat-label">Money Received</div>
          <div className="accounting-stat-value">{money(statement.received, currency)}</div>
        </div>
        <div className="accounting-stat">
          <div className="accounting-stat-label">Money Paid</div>
          <div className="accounting-stat-value">{money(statement.paid, currency)}</div>
        </div>
      </div>

      {statement.fund_balances.length > 0 && (
        <div className="card">
          <h2>Project Fund Accounts</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {statement.fund_balances.map((fund) => (
                <tr key={fund.id}>
                  <td>{fund.name}</td>
                  <td>{money(fund.balance, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Spending by Category</h2>
        {statement.spend_by_category.length === 0 ? (
          <p className="empty-state">No expenses recorded yet.</p>
        ) : (
          statement.spend_by_category.map((row) => (
            <div key={row.account_id} className="accounting-breakdown-row">
              <span>{row.account_name}</span>
              <span>{money(row.amount, currency)}</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Spending by Payee</h2>
        {statement.spend_by_payee.length === 0 ? (
          <p className="empty-state">No expenses recorded yet.</p>
        ) : (
          statement.spend_by_payee.map((row) => (
            <div key={row.counterparty_id} className="accounting-breakdown-row">
              <span>{row.counterparty_name}</span>
              <span>{money(row.amount, currency)}</span>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <h2>Transaction History</h2>
        <div className="accounting-filters">
          <label className="form-field">
            Payee/Payer
            <select value={payeeFilter} onChange={(e) => setPayeeFilter(e.target.value)}>
              <option value="">All</option>
              {payeeNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Cash Account
            <select value={cashAccountFilter} onChange={(e) => setCashAccountFilter(e.target.value)}>
              <option value="">All</option>
              {cashAccountNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="form-field">
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="empty-state">No transactions match.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Payee/Payer</th>
                <th>Category</th>
                <th>Cash Account</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((row) => (
                <tr key={row.id}>
                  <td>{row.transaction_date}</td>
                  <td>{DIRECTION_LABELS[row.direction]}</td>
                  <td>{row.counterparty_name || '—'}</td>
                  <td>{row.category_name || '—'}</td>
                  <td>{row.cash_account_name || '—'}</td>
                  <td>{money(row.amount, currency)}</td>
                  <td>
                    <span className={`status-badge status-${row.status}`}>{row.status}</span>{' '}
                    {row.reversed_by_transaction_id && <span className="status-badge status-inactive">Reversed</span>}
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

export default AccountingProjectDetailPage
