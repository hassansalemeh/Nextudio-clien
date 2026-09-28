import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { CASH_ACCOUNT_KIND_LABELS, fetchJson, money } from '../format'

type CashAccount = {
  id: string
  name: string
  kind: string
  project_id: string | null
  project_name: string | null
  currency_code: string
  is_active: boolean
  balance: number
}

function CashBankPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!book) return
    setLoading(true)
    fetchJson(`/api/accounting/cash-accounts?book_id=${book.id}`)
      .then(setAccounts)
      .catch(() => setError('Could not load cash accounts.'))
      .finally(() => setLoading(false))
  }, [book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <div className="accounting-topbar">
        <h1>Cash &amp; Bank</h1>
        <Link to="/accounting/setup" className="btn-pill">
          + Add Account
        </Link>
      </div>
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : accounts.length === 0 ? (
          <p className="empty-state">No cash or bank accounts yet. Add one in Setup.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Kind</th>
                <th>Project</th>
                <th>Currency</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    {account.name}
                    {!account.is_active && <span className="status-badge status-inactive" style={{ marginLeft: '0.5rem' }}>Inactive</span>}
                  </td>
                  <td>{CASH_ACCOUNT_KIND_LABELS[account.kind] ?? account.kind}</td>
                  <td>{account.project_id ? <Link to={`/accounting/projects/${account.project_id}`}>{account.project_name}</Link> : '—'}</td>
                  <td>{account.currency_code}</td>
                  <td>{money(account.balance, account.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default CashBankPage
