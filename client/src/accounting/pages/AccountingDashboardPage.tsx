import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

type CashBalance = { id: string; name: string; kind: string; balance: number }
// Every breakdown carries BOTH money_in and money_out on the same row, rather than one row per direction -
// so a reversal (which posts with the opposite direction of what it reverses) shows up right next to the
// original it cancels out, instead of looking like an unrelated event in its own bucket.
type ByDimension = { money_in: number; money_out: number }

type DashboardData = {
  money_in: number
  money_out: number
  cash_balances: CashBalance[]
  by_project: (ByDimension & { project_id: string; project_name: string })[]
  by_category: (ByDimension & { account_id: string; account_name: string })[]
  by_counterparty: (ByDimension & { counterparty_id: string; counterparty_name: string })[]
  by_cash_account: (ByDimension & { cash_account_id: string; cash_account_name: string })[]
}

type Transaction = {
  id: string
  direction: string
  transaction_date: string
  amount: number
  description: string | null
  project_name: string | null
  counterparty_name: string | null
  category_name: string | null
  from_cash_account_name: string | null
  to_cash_account_name: string | null
  journal_entry_id: string | null
  reversal_of_transaction_id: string | null
  reversed_by_transaction_id: string | null
}

type Drill = { label: string; params: Record<string, string> }

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function AccountingDashboardPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const navigate = useNavigate()
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drill, setDrill] = useState<Drill | null>(null)
  const [drillTransactions, setDrillTransactions] = useState<Transaction[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => {
    if (!book) return
    setLoading(true)
    setError('')
    fetchJson(`/api/accounting/dashboard?book_id=${book.id}&month=${month}`)
      .then(setData)
      .catch(() => setError('Could not load the dashboard.'))
      .finally(() => setLoading(false))
  }, [book, month])

  function openDrill(label: string, params: Record<string, string>) {
    setDrill({ label, params })
  }

  useEffect(() => {
    if (!drill || !book) return
    setDrillLoading(true)
    const search = new URLSearchParams({ book_id: book.id, ...drill.params })
    fetchJson(`/api/accounting/transactions?${search.toString()}`)
      .then(setDrillTransactions)
      .catch(() => setDrillTransactions([]))
      .finally(() => setDrillLoading(false))
  }, [drill, book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  const currency = book.currency_code

  return (
    <>
      <div className="accounting-topbar">
        <h1>Dashboard</h1>
        <label className="form-field" style={{ minWidth: 160 }}>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>

      {error && <p className="error-message">{error}</p>}
      {loading || !data ? (
        <p className="empty-state">Loading...</p>
      ) : (
        <>
          <div className="accounting-stat-row">
            <div className="accounting-stat">
              <div className="accounting-stat-label">Money Received</div>
              <button
                type="button"
                className="accounting-stat-value"
                onClick={() => openDrill('Money Received', { direction: 'money_in', date_from: `${month}-01`, date_to: `${month}-31` })}
              >
                {money(data.money_in, currency)}
              </button>
            </div>
            <div className="accounting-stat">
              <div className="accounting-stat-label">Money Paid</div>
              <button
                type="button"
                className="accounting-stat-value"
                onClick={() => openDrill('Money Paid', { direction: 'money_out', date_from: `${month}-01`, date_to: `${month}-31` })}
              >
                {money(data.money_out, currency)}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Cash &amp; Fund Balances</h2>
            {data.cash_balances.length === 0 ? (
              <p className="empty-state">No cash or bank accounts yet. Add one in Setup.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Kind</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cash_balances.map((account) => (
                    <tr key={account.id}>
                      <td>{account.name}</td>
                      <td>{account.kind}</td>
                      <td>{money(account.balance, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>By Project</h2>
            {data.by_project.length === 0 ? (
              <p className="empty-state">No activity this month.</p>
            ) : (
              data.by_project.map((row) => (
                <button
                  key={row.project_id}
                  type="button"
                  className="accounting-breakdown-row"
                  onClick={() => openDrill(row.project_name, { project_id: row.project_id, date_from: `${month}-01`, date_to: `${month}-31` })}
                >
                  <span>{row.project_name}</span>
                  <span>
                    In {money(row.money_in, currency)} · Out {money(row.money_out, currency)}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="card">
            <h2>By Purpose / Category</h2>
            {data.by_category.length === 0 ? (
              <p className="empty-state">No activity this month.</p>
            ) : (
              data.by_category.map((row) => (
                <div key={row.account_id} className="accounting-breakdown-row">
                  <span>{row.account_name}</span>
                  <span>
                    {row.money_in > 0 && (
                      <button
                        type="button"
                        className="doc-link"
                        onClick={() => openDrill(`${row.account_name} · Money In`, { category_account_id: row.account_id, direction: 'money_in', date_from: `${month}-01`, date_to: `${month}-31` })}
                      >
                        In {money(row.money_in, currency)}
                      </button>
                    )}
                    {row.money_in > 0 && row.money_out > 0 && ' · '}
                    {row.money_out > 0 && (
                      <button
                        type="button"
                        className="doc-link"
                        onClick={() => openDrill(`${row.account_name} · Money Out`, { category_account_id: row.account_id, direction: 'money_out', date_from: `${month}-01`, date_to: `${month}-31` })}
                      >
                        Out {money(row.money_out, currency)}
                      </button>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h2>By Payee / Payer</h2>
            {data.by_counterparty.length === 0 ? (
              <p className="empty-state">No activity this month.</p>
            ) : (
              data.by_counterparty.map((row) => (
                <div key={row.counterparty_id} className="accounting-breakdown-row">
                  <span>{row.counterparty_name}</span>
                  <span>
                    {row.money_in > 0 && (
                      <button
                        type="button"
                        className="doc-link"
                        onClick={() => openDrill(`${row.counterparty_name} · Money In`, { counterparty_id: row.counterparty_id, direction: 'money_in', date_from: `${month}-01`, date_to: `${month}-31` })}
                      >
                        In {money(row.money_in, currency)}
                      </button>
                    )}
                    {row.money_in > 0 && row.money_out > 0 && ' · '}
                    {row.money_out > 0 && (
                      <button
                        type="button"
                        className="doc-link"
                        onClick={() => openDrill(`${row.counterparty_name} · Money Out`, { counterparty_id: row.counterparty_id, direction: 'money_out', date_from: `${month}-01`, date_to: `${month}-31` })}
                      >
                        Out {money(row.money_out, currency)}
                      </button>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h2>By Cash / Bank Account</h2>
            {data.by_cash_account.length === 0 ? (
              <p className="empty-state">No activity this month.</p>
            ) : (
              data.by_cash_account.map((row) => (
                <div key={row.cash_account_id} className="accounting-breakdown-row">
                  <span>{row.cash_account_name}</span>
                  <span>
                    {row.money_in > 0 && (
                      <button
                        type="button"
                        className="doc-link"
                        onClick={() => openDrill(`${row.cash_account_name} · Money In`, { cash_account_id: row.cash_account_id, direction: 'money_in', date_from: `${month}-01`, date_to: `${month}-31` })}
                      >
                        In {money(row.money_in, currency)}
                      </button>
                    )}
                    {row.money_in > 0 && row.money_out > 0 && ' · '}
                    {row.money_out > 0 && (
                      <button
                        type="button"
                        className="doc-link"
                        onClick={() => openDrill(`${row.cash_account_name} · Money Out`, { cash_account_id: row.cash_account_id, direction: 'money_out', date_from: `${month}-01`, date_to: `${month}-31` })}
                      >
                        Out {money(row.money_out, currency)}
                      </button>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

          {drill && (
            <div className="card">
              <h2>{drill.label}: Transactions</h2>
              {drillLoading ? (
                <p className="empty-state">Loading...</p>
              ) : drillTransactions.length === 0 ? (
                <p className="empty-state">No transactions match.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Project</th>
                      <th>Payee/Payer</th>
                      <th>Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drillTransactions.map((t) => (
                      <tr
                        key={t.id}
                        style={{ cursor: t.journal_entry_id ? 'pointer' : undefined }}
                        onClick={() => t.journal_entry_id && navigate(`/accounting/journal/${t.journal_entry_id}`)}
                      >
                        <td>{t.transaction_date}</td>
                        <td>{t.description || '—'}</td>
                        <td>{t.project_name || '—'}</td>
                        <td>{t.counterparty_name || '—'}</td>
                        <td>{money(t.amount, currency)}</td>
                        <td>
                          {t.reversed_by_transaction_id && <span className="status-badge status-inactive">Reversed</span>}
                          {t.reversal_of_transaction_id && <span className="status-badge status-draft">Reversal</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

export default AccountingDashboardPage
