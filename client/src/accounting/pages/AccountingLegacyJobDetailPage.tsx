import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

type Statement = {
  legacy_job: { id: string; legacy_job_code: string; legacy_job_name: string; status: string; mapped_project_id: string | null }
  received: number
  paid: number
  spend_by_category: { account_id: string; account_name: string; amount: number }[]
  spend_by_payee: { counterparty_id: string; counterparty_name: string; amount: number }[]
  history: {
    line_id: string
    journal_entry_id: string
    entry_date: string
    reference: string | null
    description: string | null
    entry_kind: string
    debit: number
    credit: number
    account_name: string
    account_code: string | null
    counterparty_id: string | null
    counterparty_name: string | null
    cash_account_name: string | null
    legacy_jv_id: string | null
    legacy_narration: string | null
    legacy_reference: string | null
    legacy_base2_amount: number | null
    legacy_fx_rate: number | null
  }[]
}

// Mirrors AccountingProjectDetailPage.tsx's shape, but for a HISTORICAL-ONLY Polypus job (accounting_legacy_jobs)
// rather than a Control project - the URL and data source are different, but the point is the same: money
// received/spent, cost by category and payee, and full journal history, all drillable back to real entries.
function AccountingLegacyJobDetailPage() {
  const { id } = useParams()
  const { book, loading: bookLoading } = useAccountingBook()
  const [statement, setStatement] = useState<Statement | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    fetchJson(`/api/accounting/reports/legacy-job-statement?legacy_job_id=${id}`)
      .then(setStatement)
      .catch(() => setError('Could not load this historical job.'))
  }, [id])

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

  return (
    <>
      <p>
        <Link to="/accounting/projects">← Back to Projects</Link>
      </p>
      <h1>{statement.legacy_job.legacy_job_name}</h1>
      <p className="empty-state" style={{ marginTop: 0 }}>
        Historical job imported from Polypus ({statement.legacy_job.legacy_job_code}) -{' '}
        {statement.legacy_job.mapped_project_id ? 'confirmed-mapped to a Control project' : 'not a Control project'}.
      </p>

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

      <div className="card">
        <h2>Costs by Category</h2>
        {statement.spend_by_category.length === 0 ? (
          <p className="empty-state">No expenses recorded.</p>
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
        <h2>Costs by Payee</h2>
        {statement.spend_by_payee.length === 0 ? (
          <p className="empty-state">No expenses recorded.</p>
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
        <h2>Journal History</h2>
        {statement.history.length === 0 ? (
          <p className="empty-state">No journal entries yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Payee / Cash Account</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Legacy reference</th>
              </tr>
            </thead>
            <tbody>
              {statement.history.map((row) => (
                <tr key={row.line_id}>
                  <td>
                    <Link to={`/accounting/journal/${row.journal_entry_id}`}>{row.entry_date?.slice(0, 10)}</Link>
                  </td>
                  <td>{row.account_name}</td>
                  <td>{row.counterparty_name || row.cash_account_name || '—'}</td>
                  <td className="accounting-journal-line">{row.debit > 0 ? money(row.debit, currency) : ''}</td>
                  <td className="accounting-journal-line">{row.credit > 0 ? money(row.credit, currency) : ''}</td>
                  <td>
                    {row.legacy_jv_id ? `JV${row.legacy_jv_id}` : '—'}
                    {row.legacy_narration && <div className="empty-state">{row.legacy_narration}</div>}
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

export default AccountingLegacyJobDetailPage
