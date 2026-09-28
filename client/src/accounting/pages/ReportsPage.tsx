import { useEffect, useState } from 'react'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

type Tab = 'general-journal' | 'trial-balance' | 'account-statement' | 'cash-account-statement' | 'project-statement' | 'payee-statement' | 'professional-fees'

const TABS: { value: Tab; label: string }[] = [
  { value: 'general-journal', label: 'General Journal' },
  { value: 'trial-balance', label: 'Trial Balance' },
  { value: 'account-statement', label: 'Account Statement' },
  { value: 'cash-account-statement', label: 'Cash Account Statement' },
  { value: 'project-statement', label: 'Project Statement' },
  { value: 'payee-statement', label: 'Payee Statement' },
  { value: 'professional-fees', label: 'Professional Fees' },
]

type Account = { id: string; name: string; type: string }
type CashAccount = { id: string; name: string }
type Project = { id: string; name: string }
type Counterparty = { id: string; name: string }

function GeneralJournalReport({ bookId, currency }: { bookId: string; currency: string }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rows, setRows] = useState<{ journal_entry_id: string; entry_date: string; reference: string | null; account_name: string; debit: number; credit: number }[]>([])

  useEffect(() => {
    const search = new URLSearchParams({ book_id: bookId })
    if (dateFrom) search.set('date_from', dateFrom)
    if (dateTo) search.set('date_to', dateTo)
    fetchJson(`/api/accounting/reports/general-journal?${search.toString()}`).then(setRows).catch(() => setRows([]))
  }, [bookId, dateFrom, dateTo])

  return (
    <>
      <div className="accounting-filters">
        <label className="form-field">
          From
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="form-field">
          To
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">No posted entries in this range.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>{row.entry_date}</td>
                <td>{row.reference || `#${row.journal_entry_id}`}</td>
                <td>{row.account_name}</td>
                <td className="accounting-journal-line">{Number(row.debit) > 0 ? money(row.debit, currency) : ''}</td>
                <td className="accounting-journal-line">{Number(row.credit) > 0 ? money(row.credit, currency) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function TrialBalanceReport({ bookId, currency }: { bookId: string; currency: string }) {
  const [rows, setRows] = useState<
    { account_id: string; name: string; type: string; parent_id: string | null; parent_name: string | null; total_debit: number; total_credit: number; balance: number }[]
  >([])

  useEffect(() => {
    fetchJson(`/api/accounting/reports/trial-balance?book_id=${bookId}`).then(setRows).catch(() => setRows([]))
  }, [bookId])

  const totalDebit = rows.reduce((sum, r) => sum + Number(r.total_debit), 0)
  const totalCredit = rows.reduce((sum, r) => sum + Number(r.total_credit), 0)

  return rows.length === 0 ? (
    <p className="empty-state">No accounts yet.</p>
  ) : (
    <table className="data-table">
      <thead>
        <tr>
          <th>Account</th>
          <th>Type</th>
          <th>Total Debit</th>
          <th>Total Credit</th>
          <th>Balance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.account_id}>
            {/* An account filed under a grouping/control account (e.g. a project fund under "Project Funds /
                Project Cash") is indented under it - the parent itself is never posted to directly. */}
            <td style={row.parent_id ? { paddingLeft: '1.75rem' } : undefined}>
              {row.name}
              {row.parent_name && <span className="empty-state"> — {row.parent_name}</span>}
            </td>
            <td>{row.type}</td>
            <td className="accounting-journal-line">{money(row.total_debit, currency)}</td>
            <td className="accounting-journal-line">{money(row.total_credit, currency)}</td>
            <td className="accounting-journal-line">{money(row.balance, currency)}</td>
          </tr>
        ))}
        <tr>
          <td>
            <strong>Total</strong>
          </td>
          <td></td>
          <td className="accounting-journal-line">
            <strong>{money(totalDebit, currency)}</strong>
          </td>
          <td className="accounting-journal-line">
            <strong>{money(totalCredit, currency)}</strong>
          </td>
          <td></td>
        </tr>
      </tbody>
    </table>
  )
}

function AccountStatementReport({ bookId, currency }: { bookId: string; currency: string }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState('')
  const [statement, setStatement] = useState<{ lines: { journal_entry_id: string; entry_date: string; reference: string | null; debit: number; credit: number; running_balance: number }[] } | null>(null)

  useEffect(() => {
    fetchJson(`/api/accounting/accounts?book_id=${bookId}`).then(setAccounts).catch(() => undefined)
  }, [bookId])

  useEffect(() => {
    if (!accountId) { setStatement(null); return }
    fetchJson(`/api/accounting/reports/account-statement?account_id=${accountId}`).then(setStatement).catch(() => setStatement(null))
  }, [accountId])

  return (
    <>
      <div className="accounting-filters">
        <label className="form-field">
          Account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Select an account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!statement ? (
        <p className="empty-state">Select an account.</p>
      ) : statement.lines.length === 0 ? (
        <p className="empty-state">No posted activity on this account.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.lines.map((line, i) => (
              <tr key={i}>
                <td>{line.entry_date}</td>
                <td>{line.reference || `#${line.journal_entry_id}`}</td>
                <td className="accounting-journal-line">{Number(line.debit) > 0 ? money(line.debit, currency) : ''}</td>
                <td className="accounting-journal-line">{Number(line.credit) > 0 ? money(line.credit, currency) : ''}</td>
                <td className="accounting-journal-line">{money(line.running_balance, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function CashAccountStatementReport({ bookId, currency }: { bookId: string; currency: string }) {
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [cashAccountId, setCashAccountId] = useState('')
  const [statement, setStatement] = useState<{ lines: { journal_entry_id: string; entry_date: string; reference: string | null; debit: number; credit: number; running_balance: number }[] } | null>(null)

  useEffect(() => {
    fetchJson(`/api/accounting/cash-accounts?book_id=${bookId}`).then(setCashAccounts).catch(() => undefined)
  }, [bookId])

  useEffect(() => {
    if (!cashAccountId) { setStatement(null); return }
    fetchJson(`/api/accounting/reports/cash-account-statement?cash_account_id=${cashAccountId}`).then(setStatement).catch(() => setStatement(null))
  }, [cashAccountId])

  return (
    <>
      <div className="accounting-filters">
        <label className="form-field">
          Cash Account
          <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
            <option value="">Select an account</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!statement ? (
        <p className="empty-state">Select a cash account.</p>
      ) : statement.lines.length === 0 ? (
        <p className="empty-state">No posted activity on this account.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Running Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.lines.map((line, i) => (
              <tr key={i}>
                <td>{line.entry_date}</td>
                <td>{line.reference || `#${line.journal_entry_id}`}</td>
                <td className="accounting-journal-line">{Number(line.debit) > 0 ? money(line.debit, currency) : ''}</td>
                <td className="accounting-journal-line">{Number(line.credit) > 0 ? money(line.credit, currency) : ''}</td>
                <td className="accounting-journal-line">{money(line.running_balance, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function ProjectStatementReport({ currency, bookId }: { currency: string; bookId: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [statement, setStatement] = useState<{ received: number; paid: number } | null>(null)

  useEffect(() => {
    fetchJson('/api/projects').then(setProjects).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!projectId) { setStatement(null); return }
    fetchJson(`/api/accounting/reports/project-statement?project_id=${projectId}&book_id=${bookId}`).then(setStatement).catch(() => setStatement(null))
  }, [projectId, bookId])

  return (
    <>
      <div className="accounting-filters">
        <label className="form-field">
          Project
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {statement && (
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
      )}
      {projectId && <p className="empty-state">Open the project's own page for full detail (spend by category/payee, fund balances, filters).</p>}
    </>
  )
}

function PayeeStatementReport({ bookId, currency }: { bookId: string; currency: string }) {
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [counterpartyId, setCounterpartyId] = useState('')
  const [statement, setStatement] = useState<{ paid: number; received: number } | null>(null)

  useEffect(() => {
    fetchJson(`/api/accounting/counterparties?book_id=${bookId}`).then(setCounterparties).catch(() => undefined)
  }, [bookId])

  useEffect(() => {
    if (!counterpartyId) { setStatement(null); return }
    fetchJson(`/api/accounting/reports/payee-statement?counterparty_id=${counterpartyId}`).then(setStatement).catch(() => setStatement(null))
  }, [counterpartyId])

  return (
    <>
      <div className="accounting-filters">
        <label className="form-field">
          Payee
          <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
            <option value="">Select a payee</option>
            {counterparties.map((cp) => (
              <option key={cp.id} value={cp.id}>
                {cp.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {statement && (
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
      )}
      {counterpartyId && <p className="empty-state">Open the payee's own page for the full payment history.</p>}
    </>
  )
}

// Kept strictly separate from client/project funds (LIA-CLIENTADV/LIA-CLIENTFUNDS never contribute here):
// invoiced = revenue recognized (INC-FEES); outstanding = the CURRENT AST-RECV balance (a genuine amount
// owed to Nextudio right now, book-wide across every client sharing that one receivable account); collected
// = invoiced minus outstanding. A negative "outstanding" is possible and means collections/settlements have,
// in aggregate, outpaced new non-prepaid billing - it does NOT mean Nextudio owes clients money.
function ProfessionalFeesReport({ bookId, currency }: { bookId: string; currency: string }) {
  const [summary, setSummary] = useState<{ invoiced: number; collected: number; outstanding: number } | null>(null)

  useEffect(() => {
    fetchJson(`/api/accounting/reports/professional-fees?book_id=${bookId}`).then(setSummary).catch(() => setSummary(null))
  }, [bookId])

  if (!summary) return <p className="empty-state">Loading...</p>

  return (
    <>
      <div className="accounting-stat-row">
        <div className="accounting-stat">
          <div className="accounting-stat-label">Fees Invoiced</div>
          <div className="accounting-stat-value">{money(summary.invoiced, currency)}</div>
        </div>
        <div className="accounting-stat">
          <div className="accounting-stat-label">Fees Collected</div>
          <div className="accounting-stat-value">{money(summary.collected, currency)}</div>
        </div>
        <div className="accounting-stat">
          <div className="accounting-stat-label">Outstanding Receivable</div>
          <div className="accounting-stat-value">{money(summary.outstanding, currency)}</div>
        </div>
      </div>
      <p className="empty-state">
        Separate from client/project funds held: this counts only revenue actually recognized on an invoice (Professional / Architecture Fees), never a
        client advance or funds held for a project.
      </p>
    </>
  )
}

function ReportsPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [tab, setTab] = useState<Tab>('general-journal')

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <h1>Reports</h1>
      <div className="accounting-tabs">
        {TABS.map((t) => (
          <button key={t.value} type="button" className={`accounting-tab${tab === t.value ? ' active' : ''}`} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="card">
        {tab === 'general-journal' && <GeneralJournalReport bookId={book.id} currency={book.currency_code} />}
        {tab === 'trial-balance' && <TrialBalanceReport bookId={book.id} currency={book.currency_code} />}
        {tab === 'account-statement' && <AccountStatementReport bookId={book.id} currency={book.currency_code} />}
        {tab === 'cash-account-statement' && <CashAccountStatementReport bookId={book.id} currency={book.currency_code} />}
        {tab === 'project-statement' && <ProjectStatementReport currency={book.currency_code} bookId={book.id} />}
        {tab === 'payee-statement' && <PayeeStatementReport bookId={book.id} currency={book.currency_code} />}
        {tab === 'professional-fees' && <ProfessionalFeesReport bookId={book.id} currency={book.currency_code} />}
      </div>
    </>
  )
}

export default ReportsPage
