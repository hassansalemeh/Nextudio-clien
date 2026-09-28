import { useEffect, useState } from 'react'
import { useAccountingBook } from '../BookContext'
import { ACCOUNT_TYPE_LABELS, CASH_ACCOUNT_KIND_LABELS, COUNTERPARTY_KIND_LABELS, fetchJson, money } from '../format'
import { ACCOUNT_TYPES, CASH_ACCOUNT_KINDS, COUNTERPARTY_KINDS } from './setupTypes'

type Account = { id: string; code: string | null; name: string; type: string; description: string | null; is_active: boolean }
type CashAccount = {
  id: string
  name: string
  kind: string
  ledger_account_id: string
  project_id: string | null
  currency_code: string
  is_active: boolean
  balance: number
}
type Counterparty = { id: string; name: string; kind: string; contact_info: string | null; is_active: boolean }
type Project = { id: string; name: string }

type Tab = 'accounts' | 'cash-accounts' | 'payees'

function AccountsTab({ bookId }: { bookId: string }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState({ code: '', name: '', type: 'expense', description: '' })
  const [error, setError] = useState('')

  function load() {
    fetchJson(`/api/accounting/accounts?book_id=${bookId}`).then(setAccounts).catch(() => setError('Could not load accounts.'))
  }
  useEffect(load, [bookId])

  async function create() {
    setError('')
    if (!form.name.trim()) return setError('Account name is required.')
    try {
      await fetchJson('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: bookId, code: form.code || null, name: form.name, type: form.type, description: form.description || null }),
      })
      setForm({ code: '', name: '', type: 'expense', description: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account.')
    }
  }

  async function toggleActive(account: Account) {
    await fetchJson(`/api/accounting/accounts/${account.id}/${account.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' }).catch(() => undefined)
    load()
  }

  return (
    <>
      <div className="card">
        <h2>Add Account</h2>
        <div className="form-grid">
          <label className="form-field">
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Concrete Labor" />
          </label>
          <label className="form-field">
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Code (optional)
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </label>
          <label className="form-field">
            Description (optional)
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="button" className="btn-primary" onClick={create}>
          Add Account
        </button>
      </div>
      <div className="card">
        <h2>Chart of Accounts</h2>
        {accounts.length === 0 ? (
          <p className="empty-state">No accounts yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Code</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.name}
                    {!a.is_active && <span className="status-badge status-inactive" style={{ marginLeft: '0.5rem' }}>Inactive</span>}
                  </td>
                  <td>{ACCOUNT_TYPE_LABELS[a.type] ?? a.type}</td>
                  <td>{a.code || '—'}</td>
                  <td>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => toggleActive(a)}>
                      {a.is_active ? 'Deactivate' : 'Reactivate'}
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

function CashAccountsTab({ bookId }: { bookId: string }) {
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [assetAccounts, setAssetAccounts] = useState<Account[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [form, setForm] = useState({ name: '', kind: 'cash', ledger_account_id: '', project_id: '', currency_code: 'USD' })
  const [error, setError] = useState('')

  function load() {
    fetchJson(`/api/accounting/cash-accounts?book_id=${bookId}`).then(setCashAccounts).catch(() => setError('Could not load cash accounts.'))
    fetchJson(`/api/accounting/accounts?book_id=${bookId}`).then((all: Account[]) => setAssetAccounts(all.filter((a) => a.type === 'asset'))).catch(() => undefined)
    fetchJson('/api/projects').then(setProjects).catch(() => undefined)
  }
  useEffect(load, [bookId])

  async function create() {
    setError('')
    if (!form.name.trim()) return setError('Account name is required.')
    if (!form.ledger_account_id) return setError('Choose the asset account this posts to.')
    if (form.kind === 'project_fund' && !form.project_id) return setError('A project fund account must be linked to a project.')
    try {
      await fetchJson('/api/accounting/cash-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: bookId, name: form.name, kind: form.kind, ledger_account_id: form.ledger_account_id,
          project_id: form.project_id || null, currency_code: form.currency_code,
        }),
      })
      setForm({ name: '', kind: 'cash', ledger_account_id: '', project_id: '', currency_code: 'USD' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create cash account.')
    }
  }

  async function toggleActive(account: CashAccount) {
    await fetchJson(`/api/accounting/cash-accounts/${account.id}/${account.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' }).catch(() => undefined)
    load()
  }

  return (
    <>
      <div className="card">
        <h2>Add Cash / Bank Account</h2>
        {assetAccounts.length === 0 && (
          <p className="empty-state">Add an Asset account first (Chart of Accounts tab) - a cash account must post to one.</p>
        )}
        <div className="form-grid">
          <label className="form-field">
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. DNT Cash" />
          </label>
          <label className="form-field">
            Kind
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {CASH_ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CASH_ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Posts to (asset account)
            <select value={form.ledger_account_id} onChange={(e) => setForm({ ...form, ledger_account_id: e.target.value })}>
              <option value="">Select an asset account</option>
              {assetAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Project {form.kind === 'project_fund' ? '(required)' : '(optional)'}
            <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
              <option value="">(none)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Currency
            <input value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value.toUpperCase() })} maxLength={3} />
          </label>
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="button" className="btn-primary" onClick={create}>
          Add Cash Account
        </button>
      </div>
      <div className="card">
        <h2>Cash &amp; Bank Accounts</h2>
        {cashAccounts.length === 0 ? (
          <p className="empty-state">No cash accounts yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cashAccounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.name}
                    {!a.is_active && <span className="status-badge status-inactive" style={{ marginLeft: '0.5rem' }}>Inactive</span>}
                  </td>
                  <td>{CASH_ACCOUNT_KIND_LABELS[a.kind] ?? a.kind}</td>
                  <td>{money(a.balance, a.currency_code)}</td>
                  <td>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => toggleActive(a)}>
                      {a.is_active ? 'Deactivate' : 'Reactivate'}
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

function PayeesTab({ bookId }: { bookId: string }) {
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [form, setForm] = useState({ name: '', kind: 'contractor', contact_info: '' })
  const [error, setError] = useState('')

  function load() {
    fetchJson(`/api/accounting/counterparties?book_id=${bookId}`).then(setCounterparties).catch(() => setError('Could not load payees.'))
  }
  useEffect(load, [bookId])

  async function create() {
    setError('')
    if (!form.name.trim()) return setError('Payee name is required.')
    try {
      await fetchJson('/api/accounting/counterparties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: bookId, name: form.name, kind: form.kind, contact_info: form.contact_info || null }),
      })
      setForm({ name: '', kind: 'contractor', contact_info: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create payee.')
    }
  }

  async function toggleActive(cp: Counterparty) {
    await fetchJson(`/api/accounting/counterparties/${cp.id}/${cp.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' }).catch(() => undefined)
    load()
  }

  return (
    <>
      <div className="card">
        <h2>Add Payee</h2>
        <div className="form-grid">
          <label className="form-field">
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ahmad" />
          </label>
          <label className="form-field">
            Kind
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {COUNTERPARTY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {COUNTERPARTY_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Contact Info (optional)
            <input value={form.contact_info} onChange={(e) => setForm({ ...form, contact_info: e.target.value })} />
          </label>
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="button" className="btn-primary" onClick={create}>
          Add Payee
        </button>
      </div>
      <div className="card">
        <h2>Payees</h2>
        {counterparties.length === 0 ? (
          <p className="empty-state">No payees yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {counterparties.map((cp) => (
                <tr key={cp.id}>
                  <td>
                    {cp.name}
                    {!cp.is_active && <span className="status-badge status-inactive" style={{ marginLeft: '0.5rem' }}>Inactive</span>}
                  </td>
                  <td>{COUNTERPARTY_KIND_LABELS[cp.kind] ?? cp.kind}</td>
                  <td>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => toggleActive(cp)}>
                      {cp.is_active ? 'Deactivate' : 'Reactivate'}
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

function SetupPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [tab, setTab] = useState<Tab>('accounts')

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <h1>Setup</h1>
      <p className="empty-state" style={{ marginTop: 0 }}>Editing setup for: <strong>{book.name}</strong></p>
      <div className="accounting-tabs">
        <button type="button" className={`accounting-tab${tab === 'accounts' ? ' active' : ''}`} onClick={() => setTab('accounts')}>
          Chart of Accounts
        </button>
        <button type="button" className={`accounting-tab${tab === 'cash-accounts' ? ' active' : ''}`} onClick={() => setTab('cash-accounts')}>
          Cash &amp; Bank Accounts
        </button>
        <button type="button" className={`accounting-tab${tab === 'payees' ? ' active' : ''}`} onClick={() => setTab('payees')}>
          Payees
        </button>
      </div>
      {tab === 'accounts' && <AccountsTab bookId={book.id} />}
      {tab === 'cash-accounts' && <CashAccountsTab bookId={book.id} />}
      {tab === 'payees' && <PayeesTab bookId={book.id} />}
    </>
  )
}

export default SetupPage
