import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDateString } from '../../timeUtils'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

type CashAccount = { id: string; name: string; kind: string; currency_code: string }
type Account = { id: string; name: string; type: string }
type Counterparty = { id: string; name: string; kind: string }
type Project = { id: string; name: string }

type Direction = 'money_out' | 'money_in' | 'transfer'

const TABS: { value: Direction; label: string }[] = [
  { value: 'money_out', label: 'Money Out' },
  { value: 'money_in', label: 'Money In' },
  { value: 'transfer', label: 'Transfer' },
]

function emptyForm() {
  return {
    counterparty_id: '',
    project_id: '',
    category_account_id: '',
    from_cash_account_id: '',
    to_cash_account_id: '',
    amount: '',
    currency_code: 'USD',
    transaction_date: localDateString(),
    description: '',
  }
}

function AddTransactionPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const navigate = useNavigate()

  const [direction, setDirection] = useState<Direction>('money_out')
  const [form, setForm] = useState(emptyForm())
  const [step, setStep] = useState<'form' | 'review'>('form')

  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [posted, setPosted] = useState<{ id: string; reference: string } | null>(null)

  useEffect(() => {
    if (!book) return
    fetchJson(`/api/accounting/cash-accounts?book_id=${book.id}`).then(setCashAccounts).catch(() => undefined)
    fetchJson(`/api/accounting/accounts?book_id=${book.id}`).then(setAccounts).catch(() => undefined)
    fetchJson(`/api/accounting/counterparties?book_id=${book.id}`).then(setCounterparties).catch(() => undefined)
    fetchJson('/api/projects').then(setProjects).catch(() => undefined)
  }, [book])

  useEffect(() => {
    setForm(emptyForm())
    setStep('form')
    setError('')
    setPosted(null)
  }, [direction])

  const categoryOptions = useMemo(() => {
    if (direction === 'money_out') return accounts.filter((a) => a.type === 'expense' || a.type === 'asset')
    if (direction === 'money_in') return accounts.filter((a) => a.type === 'income' || a.type === 'liability')
    return []
  }, [accounts, direction])

  function update<K extends keyof ReturnType<typeof emptyForm>>(field: K, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function validate(): string | null {
    if (!form.amount || Number(form.amount) <= 0) return 'Amount must be greater than 0.'
    if (!form.transaction_date) return 'Date is required.'
    if (direction === 'money_out') {
      if (!form.from_cash_account_id) return 'Choose the account this was paid from.'
      if (!form.category_account_id) return 'Choose a purpose.'
    } else if (direction === 'money_in') {
      if (!form.to_cash_account_id) return 'Choose the account this was received into.'
      if (!form.category_account_id) return 'Choose what this money is for.'
    } else {
      if (!form.from_cash_account_id) return 'Choose the account to transfer from.'
      if (!form.to_cash_account_id) return 'Choose the account to transfer to.'
      if (form.from_cash_account_id === form.to_cash_account_id) return 'The transfer accounts must be different.'
    }
    return null
  }

  function goToReview() {
    const message = validate()
    if (message) {
      setError(message)
      return
    }
    setError('')
    setStep('review')
  }

  async function confirmPost() {
    if (!book) return
    setBusy(true)
    setError('')
    try {
      const result = await fetchJson('/api/accounting/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: book.id,
          direction,
          transaction_date: form.transaction_date,
          amount: Number(form.amount),
          currency_code: form.currency_code,
          description: form.description || null,
          project_id: form.project_id || null,
          counterparty_id: form.counterparty_id || null,
          category_account_id: direction === 'transfer' ? null : form.category_account_id || null,
          from_cash_account_id: direction === 'money_in' ? null : form.from_cash_account_id || null,
          to_cash_account_id: direction === 'money_out' ? null : form.to_cash_account_id || null,
        }),
      })
      setPosted({ id: result.id, reference: result.journal_reference || result.reference })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post the transaction.')
    } finally {
      setBusy(false)
    }
  }

  function findName(list: { id: string; name: string }[], id: string) {
    return list.find((item) => item.id === id)?.name ?? '—'
  }

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  if (posted) {
    return (
      <>
        <h1>Add Transaction</h1>
        <div className="card">
          <p className="doc-saved">Posted. Journal reference: {posted.reference}</p>
          <button type="button" className="btn-pill" onClick={() => { setPosted(null); setForm(emptyForm()); setStep('form') }}>
            Add another
          </button>{' '}
          <button type="button" className="btn-outline" onClick={() => navigate('/accounting/journal')}>
            View in Journal
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h1>Add Transaction</h1>

      <div className="accounting-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`accounting-tab${direction === tab.value ? ' active' : ''}`}
            onClick={() => setDirection(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="error-message">{error}</p>}

      {step === 'form' ? (
        <div className="card">
          <div className="form-grid">
            {direction !== 'money_in' && (
              <label className="form-field">
                Paid From
                <select value={form.from_cash_account_id} onChange={(e) => update('from_cash_account_id', e.target.value)}>
                  <option value="">Select an account</option>
                  {cashAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {direction !== 'money_out' && (
              <label className="form-field">
                {direction === 'transfer' ? 'Transfer To' : 'Received Into'}
                <select value={form.to_cash_account_id} onChange={(e) => update('to_cash_account_id', e.target.value)}>
                  <option value="">Select an account</option>
                  {cashAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {direction !== 'transfer' && (
              <>
                <label className="form-field">
                  {direction === 'money_out' ? 'Paid To' : 'Received From'}
                  <select value={form.counterparty_id} onChange={(e) => update('counterparty_id', e.target.value)}>
                    <option value="">(none)</option>
                    {counterparties.map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Purpose
                  <select value={form.category_account_id} onChange={(e) => update('category_account_id', e.target.value)}>
                    <option value="">Select a purpose / category</option>
                    {categoryOptions.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Project
                  <select value={form.project_id} onChange={(e) => update('project_id', e.target.value)}>
                    <option value="">(none - company expense/income)</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="form-field">
              Amount
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => update('amount', e.target.value)} />
            </label>
            <label className="form-field">
              Currency
              <input value={form.currency_code} onChange={(e) => update('currency_code', e.target.value.toUpperCase())} maxLength={3} />
            </label>
            <label className="form-field">
              Date
              <input type="date" value={form.transaction_date} onChange={(e) => update('transaction_date', e.target.value)} />
            </label>
            <label className="form-field">
              Description
              <input value={form.description} onChange={(e) => update('description', e.target.value)} />
            </label>
          </div>
          <button type="button" className="btn-primary" onClick={goToReview}>
            Continue
          </button>
        </div>
      ) : (
        <div className="card">
          <h2>Review before posting</h2>
          <dl className="accounting-review-list">
            {form.project_id && (
              <>
                <dt>Project</dt>
                <dd>{findName(projects, form.project_id)}</dd>
              </>
            )}
            {form.counterparty_id && (
              <>
                <dt>{direction === 'money_out' ? 'Paid To' : 'Received From'}</dt>
                <dd>{findName(counterparties, form.counterparty_id)}</dd>
              </>
            )}
            <dt>Amount</dt>
            <dd>{money(Number(form.amount) || 0, form.currency_code)}</dd>
            {form.from_cash_account_id && (
              <>
                <dt>{direction === 'transfer' ? 'Transfer From' : 'Paid From'}</dt>
                <dd>{findName(cashAccounts, form.from_cash_account_id)}</dd>
              </>
            )}
            {form.to_cash_account_id && (
              <>
                <dt>{direction === 'transfer' ? 'Transfer To' : 'Received Into'}</dt>
                <dd>{findName(cashAccounts, form.to_cash_account_id)}</dd>
              </>
            )}
            {form.category_account_id && (
              <>
                <dt>Purpose</dt>
                <dd>{findName(categoryOptions, form.category_account_id)}</dd>
              </>
            )}
            <dt>Date</dt>
            <dd>{form.transaction_date}</dd>
            {form.description && (
              <>
                <dt>Description</dt>
                <dd>{form.description}</dd>
              </>
            )}
            <dt>Journal entry</dt>
            <dd>
              {direction === 'money_out' &&
                `Debits ${findName(categoryOptions, form.category_account_id)} ${form.amount} · Credits ${findName(cashAccounts, form.from_cash_account_id)} ${form.amount}`}
              {direction === 'money_in' &&
                `Debits ${findName(cashAccounts, form.to_cash_account_id)} ${form.amount} · Credits ${findName(categoryOptions, form.category_account_id)} ${form.amount}`}
              {direction === 'transfer' &&
                `Debits ${findName(cashAccounts, form.to_cash_account_id)} ${form.amount} · Credits ${findName(cashAccounts, form.from_cash_account_id)} ${form.amount}`}
            </dd>
          </dl>
          <button type="button" className="btn-outline" disabled={busy} onClick={() => setStep('form')}>
            Back
          </button>{' '}
          <button type="button" className="btn-primary" disabled={busy} onClick={confirmPost}>
            Confirm &amp; Post
          </button>
        </div>
      )}
    </>
  )
}

export default AddTransactionPage
