import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { ACCOUNT_TYPE_LABELS, CASH_ACCOUNT_KIND_LABELS, COUNTERPARTY_KIND_LABELS, fetchJson, money } from '../format'
import { ACCOUNT_TYPES, CASH_ACCOUNT_KINDS, COUNTERPARTY_KINDS } from './setupTypes'

type Account = { id: string; code: string | null; name: string; type: string; description: string | null; is_active: boolean }
type CashAccount = {
  id: string
  name: string
  kind: string
  ledger_account_id: string
  ledger_account_name: string
  project_id: string | null
  project_name: string | null
  currency_code: string
  is_active: boolean
  balance: number
}
type Counterparty = { id: string; name: string; kind: string; contact_info: string | null; is_active: boolean }
type Project = { id: string; name: string }

type Tab = 'accounts' | 'categories' | 'cash-bank' | 'project-funds' | 'payees' | 'posting-rules'

const STRUCTURAL_TYPES = ACCOUNT_TYPES.filter((t) => t === 'asset' || t === 'liability' || t === 'equity')
const CATEGORY_TYPES = ACCOUNT_TYPES.filter((t) => t === 'income' || t === 'expense')
const NON_FUND_KINDS = CASH_ACCOUNT_KINDS.filter((k) => k !== 'project_fund')

// Shared by the Accounts and Categories tabs, which are both just the chart of accounts filtered to a
// different set of types - keeping non-accountants from having to think about "type" as one big flat list.
function AccountsSubTab({
  bookId, allowedTypes, heading, addHeading, namePlaceholder,
}: {
  bookId: string
  allowedTypes: readonly string[]
  heading: string
  addHeading: string
  namePlaceholder: string
}) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [form, setForm] = useState({ code: '', name: '', type: allowedTypes[0], description: '' })
  const [error, setError] = useState('')

  function load() {
    fetchJson(`/api/accounting/accounts?book_id=${bookId}`)
      .then((all: Account[]) => setAccounts(all.filter((a) => allowedTypes.includes(a.type))))
      .catch(() => setError(`Could not load ${heading.toLowerCase()}.`))
  }
  useEffect(load, [bookId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    setError('')
    if (!form.name.trim()) return setError('Name is required.')
    try {
      await fetchJson('/api/accounting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book_id: bookId, code: form.code || null, name: form.name, type: form.type, description: form.description || null }),
      })
      setForm({ code: '', name: '', type: allowedTypes[0], description: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  async function toggleActive(account: Account) {
    await fetchJson(`/api/accounting/accounts/${account.id}/${account.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' }).catch(() => undefined)
    load()
  }

  return (
    <>
      <div className="card">
        <h2>{addHeading}</h2>
        <div className="form-grid">
          <label className="form-field">
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={namePlaceholder} />
          </label>
          <label className="form-field">
            Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {allowedTypes.map((t) => (
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
          {addHeading}
        </button>
      </div>
      <div className="card">
        <h2>{heading}</h2>
        {accounts.length === 0 ? (
          <p className="empty-state">None yet.</p>
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

function AccountsTab({ bookId }: { bookId: string }) {
  return (
    <AccountsSubTab
      bookId={bookId}
      allowedTypes={STRUCTURAL_TYPES}
      heading="Accounts"
      addHeading="Add Account"
      namePlaceholder="e.g. Supplier/Contractor Payables"
    />
  )
}

function CategoriesTab({ bookId }: { bookId: string }) {
  return (
    <AccountsSubTab
      bookId={bookId}
      allowedTypes={CATEGORY_TYPES}
      heading="Categories"
      addHeading="Add Category"
      namePlaceholder="e.g. Concrete Works"
    />
  )
}

// Shared by Cash & Bank (everyday cash/bank/card/petty-cash accounts) and Project Funds (kind = project_fund,
// each tied to one existing Control project) - both are accounting_cash_accounts, just filtered differently.
function CashAccountsSubTab({
  bookId, allowedKinds, projectFundMode,
}: {
  bookId: string
  allowedKinds: readonly string[]
  projectFundMode: boolean
}) {
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [assetAccounts, setAssetAccounts] = useState<Account[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [form, setForm] = useState({ name: '', kind: allowedKinds[0], ledger_account_id: '', project_id: '', currency_code: 'USD' })
  const [error, setError] = useState('')

  function load() {
    fetchJson(`/api/accounting/cash-accounts?book_id=${bookId}`)
      .then((all: CashAccount[]) => setCashAccounts(all.filter((a) => allowedKinds.includes(a.kind))))
      .catch(() => setError('Could not load accounts.'))
    fetchJson(`/api/accounting/accounts?book_id=${bookId}`).then((all: Account[]) => setAssetAccounts(all.filter((a) => a.type === 'asset' && a.is_active && a.code !== 'AST-PROJFUND' && !a.code?.startsWith('PROJFUND-')))).catch(() => undefined)
    fetchJson('/api/projects').then(setProjects).catch(() => undefined)
  }
  useEffect(load, [bookId]) // eslint-disable-line react-hooks/exhaustive-deps

  function chooseProject(projectId: string) {
    const project = projects.find((p) => p.id === projectId)
    setForm((previous) => ({
      ...previous,
      project_id: projectId,
      // suggest "<Project> Cash", but never overwrite something already typed
      name: previous.name || (project ? `${project.name} Cash` : previous.name),
    }))
  }

  async function create() {
    setError('')
    if (!form.name.trim()) return setError('Account name is required.')
    if (projectFundMode && !form.project_id) return setError('A project fund must be linked to a project.')
    if (!projectFundMode && !form.ledger_account_id) return setError('Choose the asset account this posts to.')
    try {
      await fetchJson('/api/accounting/cash-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: bookId, name: form.name, kind: projectFundMode ? 'project_fund' : form.kind,
          // A new fund gets a new ledger, even when another fund belongs to the same project.
          ledger_account_id: projectFundMode ? null : form.ledger_account_id,
          project_id: form.project_id || null, currency_code: form.currency_code,
        }),
      })
      setForm({ name: '', kind: allowedKinds[0], ledger_account_id: '', project_id: '', currency_code: 'USD' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.')
    }
  }

  async function toggleActive(account: CashAccount) {
    await fetchJson(`/api/accounting/cash-accounts/${account.id}/${account.is_active ? 'deactivate' : 'reactivate'}`, { method: 'POST' }).catch(() => undefined)
    load()
  }

  return (
    <>
      <div className="card">
        <h2>{projectFundMode ? 'Add Project Fund' : 'Add Cash / Bank Account'}</h2>
        {!projectFundMode && assetAccounts.length === 0 && <p className="empty-state">Add an Asset account first (Accounts tab) - this must post to one.</p>}
        <div className="form-grid">
          {projectFundMode && (
            <label className="form-field">
              Project
              <select value={form.project_id} onChange={(e) => chooseProject(e.target.value)}>
                <option value="">Select the project this fund belongs to</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="form-field">
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={projectFundMode ? 'e.g. DNT Cash' : 'e.g. Main Bank Account'} />
          </label>
          {projectFundMode ? (
            <p className="empty-state" style={{ alignSelf: 'end', marginBottom: '0.35rem' }}>
              This fund gets its own dedicated ledger account automatically - it's never shared with another fund.
            </p>
          ) : (
            <>
              <label className="form-field">
                Kind
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {allowedKinds.map((k) => (
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
            </>
          )}
          <label className="form-field">
            Currency
            <input value={form.currency_code} onChange={(e) => setForm({ ...form, currency_code: e.target.value.toUpperCase() })} maxLength={3} />
          </label>
        </div>
        {error && <p className="error-message">{error}</p>}
        <button type="button" className="btn-primary" onClick={create}>
          {projectFundMode ? 'Add Project Fund' : 'Add Cash Account'}
        </button>
      </div>
      <div className="card">
        <h2>{projectFundMode ? 'Project Funds' : 'Cash & Bank Accounts'}</h2>
        {cashAccounts.length === 0 ? (
          <p className="empty-state">{projectFundMode ? 'No project funds yet.' : 'No cash accounts yet.'}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                {projectFundMode ? <th>Project</th> : <th>Kind</th>}
                <th>Posts To</th>
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
                  {projectFundMode ? (
                    <td>{a.project_id ? <Link to={`/accounting/projects/${a.project_id}`}>{a.project_name}</Link> : '—'}</td>
                  ) : (
                    <td>{CASH_ACCOUNT_KIND_LABELS[a.kind] ?? a.kind}</td>
                  )}
                  <td>{a.ledger_account_name}</td>
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

function CashBankTab({ bookId }: { bookId: string }) {
  return <CashAccountsSubTab bookId={bookId} allowedKinds={NON_FUND_KINDS} projectFundMode={false} />
}

function ProjectFundsTab({ bookId }: { bookId: string }) {
  return (
    <>
      <p className="empty-state" style={{ marginTop: 0 }}>
        A project fund is money held on behalf of one existing project (e.g. "DNT Cash"). Its balance always comes from posted journal lines -
        never a number typed in here.
      </p>
      <CashAccountsSubTab bookId={bookId} allowedKinds={['project_fund']} projectFundMode />
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
  useEffect(load, [bookId]) // eslint-disable-line react-hooks/exhaustive-deps

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
      <p className="empty-state" style={{ marginTop: 0 }}>
        One payee record is shared across every project - never recreate the same person or company for a different project. Their own page shows
        totals and full history across all of them.
      </p>
      <div className="card">
        <h2>Add Payee</h2>
        <div className="form-grid">
          <label className="form-field">
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mahmoud Alahmad" />
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
                    <Link to={`/accounting/payees/${cp.id}`}>{cp.name}</Link>
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

const POSTING_RULES: { action: string; example: string; debit: string; credit: string; keeps: string }[] = [
  {
    action: 'Nextudio project / company expense',
    example: 'Nextudio owes the cost: Mahmoud / $500 / Concrete Works / Nextudio Cash',
    debit: 'Cost category (e.g. Concrete Works)',
    credit: 'The cash/bank/project-fund account paid from',
    keeps: 'Project + Payee',
  },
  {
    action: 'Client-held fund disbursement',
    example: 'DNT / Mahmoud / $500 / Concrete Works classification / DNT Cash',
    debit: 'Client Project Funds Held (liability reduced)',
    credit: 'DNT Cash (its dedicated asset ledger)',
    keeps: 'Project, payee, date, purpose, source fund and classification; no expense or revenue',
  },
  {
    action: 'Project funding received',
    example: 'Client gives DNT $5,000 to spend on the project',
    debit: 'The project fund/cash account received into',
    credit: 'A project-funds-held liability (never professional fee income)',
    keeps: 'Project + Payer',
  },
  {
    action: 'Professional fee received',
    example: 'Nextudio earns a design fee',
    debit: 'Nextudio cash/bank account received into',
    credit: 'Professional / Architecture Fees (income)',
    keeps: 'Payer, usually no project fund involved',
  },
  {
    action: 'Transfer',
    example: 'DNT Cash → Bank, or Nextudio Cash → Petty Cash',
    debit: 'Destination cash/bank account',
    credit: 'Source cash/bank account',
    keeps: 'Never income or expense',
  },
  {
    action: 'Bill received (Bill / Payable tab)',
    example: 'Owe a supplier for concrete, not paid yet',
    debit: 'Cost category (e.g. Concrete Works)',
    credit: 'A payable account (e.g. Supplier/Contractor Payables)',
    keeps: 'Project + Payee, no cash moves yet',
  },
  {
    action: 'Settle that bill later',
    example: '$1,000 bill, $400 paid from bank, $600 still owed',
    debit: 'The same payable account (as the Purpose)',
    credit: 'The cash/bank account paid from',
    keeps: 'Project + Payee - this is an ordinary Money Out',
  },
  {
    action: 'Opening balance (future verified entry)',
    example: 'Verified asset opening on the migration date',
    debit: 'Balance-sheet account (or Opening Balance Equity for a credit opening)',
    credit: 'Opening Balance Equity (or the balance-sheet account for a credit opening)',
    keeps: 'Effective date, currency, source reference, description, project/fund and audit; never income/expense',
  },
]

function PostingRulesTab() {
  return (
    <div className="card">
      <h2>Posting Rules</h2>
      <p className="empty-state" style={{ marginTop: 0 }}>
        Reference for Add Transaction: the accounts follow your Purpose, Paid From/Into and Payable Account selections.
        Client funding and disbursements use Client Project Funds Held. Opening balances use Opening Balance Equity.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Business action</th>
            <th>Example</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>Keeps</th>
          </tr>
        </thead>
        <tbody>
          {POSTING_RULES.map((rule) => (
            <tr key={rule.action}>
              <td style={{ fontWeight: 600 }}>{rule.action}</td>
              <td>{rule.example}</td>
              <td>{rule.debit}</td>
              <td>{rule.credit}</td>
              <td>{rule.keeps}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'accounts', label: 'Accounts' },
  { value: 'categories', label: 'Categories' },
  { value: 'cash-bank', label: 'Cash & Bank' },
  { value: 'project-funds', label: 'Project Funds' },
  { value: 'payees', label: 'Payees' },
  { value: 'posting-rules', label: 'Posting Rules' },
]

function SetupPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [tab, setTab] = useState<Tab>('accounts')

  const activePanel = useMemo(() => {
    if (!book) return null
    switch (tab) {
      case 'accounts': return <AccountsTab bookId={book.id} />
      case 'categories': return <CategoriesTab bookId={book.id} />
      case 'cash-bank': return <CashBankTab bookId={book.id} />
      case 'project-funds': return <ProjectFundsTab bookId={book.id} />
      case 'payees': return <PayeesTab bookId={book.id} />
      case 'posting-rules': return <PostingRulesTab />
    }
  }, [tab, book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <h1>Setup</h1>
      <p className="empty-state" style={{ marginTop: 0 }}>Editing setup for: <strong>{book.name}</strong></p>
      <div className="accounting-tabs">
        {TABS.map((t) => (
          <button key={t.value} type="button" className={`accounting-tab${tab === t.value ? ' active' : ''}`} onClick={() => setTab(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      {activePanel}
    </>
  )
}

export default SetupPage
