import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { localDateString } from '../../timeUtils'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

type CashAccount = { id: string; name: string; kind: string; ledger_account_id: string; project_id: string | null; currency_code: string; is_active: boolean }
type Account = { id: string; name: string; code: string | null; type: string; is_active: boolean }
type Counterparty = { id: string; name: string; kind: string }
type Project = { id: string; name: string }

// 'fund_disbursement' is a tab on this page only, not a real backend direction: it always posts as an
// ordinary money_out (Dr the client-fund liability chosen below / Cr the project fund paid from), with an
// required management classification - see classification_account_id below.
type Direction = 'money_out' | 'money_in' | 'transfer' | 'non_cash' | 'fund_disbursement'

const TABS: { value: Direction; label: string }[] = [
  { value: 'money_out', label: 'Money Out' },
  { value: 'money_in', label: 'Money In' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'non_cash', label: 'Bill / Payable' },
  { value: 'fund_disbursement', label: 'Client Fund Disbursement' },
]

function emptyForm() {
  return {
    counterparty_id: '',
    project_id: '',
    category_account_id: '',
    from_cash_account_id: '',
    to_cash_account_id: '',
    contra_account_id: '',
    classification_account_id: '',
    amount: '',
    currency_code: 'USD',
    transaction_date: localDateString(),
    description: '',
    reference: '',
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
    fetchJson(`/api/accounting/cash-accounts?book_id=${book.id}`).then((rows: CashAccount[]) => setCashAccounts(rows.filter((a) => a.is_active))).catch(() => undefined)
    fetchJson(`/api/accounting/accounts?book_id=${book.id}`).then((rows: Account[]) => setAccounts(rows.filter((a) => a.is_active && !['AST-PROJFUND', 'EQ-OPENING'].includes(a.code ?? '')))).catch(() => undefined)
    fetchJson(`/api/accounting/counterparties?book_id=${book.id}`).then(setCounterparties).catch(() => undefined)
    fetchJson('/api/projects').then(setProjects).catch(() => undefined)
  }, [book])

  useEffect(() => {
    setForm(emptyForm())
    setStep('form')
    setError('')
    setPosted(null)
  }, [direction, book?.id])

  const categoryOptions = useMemo(() => {
    const purposes = accounts.filter((a) => !cashAccounts.some((cash) => cash.ledger_account_id === a.id))
    if (direction === 'money_out') return purposes.filter((a) => ['expense', 'asset', 'liability'].includes(a.type) && a.code !== 'LIA-CLIENTFUNDS')
    if (direction === 'non_cash') return purposes.filter((a) => a.type === 'expense' || a.type === 'asset')
    if (direction === 'money_in') {
      const fundReceipt = cashAccounts.find((a) => a.id === form.to_cash_account_id)?.kind === 'project_fund'
      return accounts.filter((a) => fundReceipt ? a.code === 'LIA-CLIENTFUNDS' : a.type === 'income' || a.type === 'liability')
    }
    return []
  }, [accounts, direction, cashAccounts, form.to_cash_account_id])

  // The "Payable Account" for a Bill / Payable entry - what we now owe, e.g. Supplier/Contractor Payables.
  // Settling it later is an ordinary Money Out whose Purpose is this same liability account.
  // Client disbursements use the separate, reserved funds-held liability choice.
  const payableOptions = useMemo(() => accounts.filter((a) => a.type === 'liability' && a.code !== 'LIA-CLIENTFUNDS'), [accounts])
  const clientFundOptions = useMemo(() => accounts.filter((a) => a.code === 'LIA-CLIENTFUNDS' && a.type === 'liability'), [accounts])

  // Classification is a reporting TAG only for a client fund disbursement - it is never the account actually
  // debited (that's always the liability above), so disbursing client-held money never looks like a Nextudio
  // expense while still letting Project/Payee reports show "Concrete Works: $500" for it.
  const classificationOptions = useMemo(() => accounts.filter((a) => a.type === 'expense'), [accounts])

  function update<K extends keyof ReturnType<typeof emptyForm>>(field: K, value: string) {
    if (field === 'from_cash_account_id' || field === 'to_cash_account_id') {
      const cash = cashAccounts.find((a) => a.id === value)
      setForm((previous) => ({ ...previous, [field]: value,
        project_id: cash?.kind === 'project_fund' ? cash.project_id ?? '' : previous.project_id,
        currency_code: cash?.currency_code ?? previous.currency_code,
        category_account_id: field === 'to_cash_account_id' ? '' : previous.category_account_id,
      }))
      return
    }
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
    } else if (direction === 'non_cash') {
      if (!form.category_account_id) return 'Choose the cost category.'
      if (!form.contra_account_id) return 'Choose the payable account.'
      if (form.category_account_id === form.contra_account_id) return 'The two accounts must be different.'
    } else if (direction === 'fund_disbursement') {
      if (!form.project_id) return 'Choose the project this fund belongs to.'
      if (!form.from_cash_account_id) return 'Choose the project fund to pay from.'
      if (!form.category_account_id) return 'Choose the client fund liability account this reduces.'
      if (!form.counterparty_id || !form.classification_account_id || !form.description.trim()) return 'Choose a payee, classification and purpose for the client disbursement.'
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
      // fund_disbursement is not a real backend direction - it always posts as an ordinary money_out
      const postedDirection = direction === 'fund_disbursement' ? 'money_out' : direction
      const result = await fetchJson('/api/accounting/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: book.id,
          direction: postedDirection,
          transaction_date: form.transaction_date,
          amount: Number(form.amount),
          currency_code: form.currency_code,
          reference: form.reference || null,
          description: form.description || null,
          project_id: form.project_id || null,
          counterparty_id: form.counterparty_id || null,
          category_account_id: direction === 'transfer' ? null : form.category_account_id || null,
          from_cash_account_id: direction === 'money_in' || direction === 'non_cash' ? null : form.from_cash_account_id || null,
          to_cash_account_id: direction === 'money_out' || direction === 'non_cash' || direction === 'fund_disbursement' ? null : form.to_cash_account_id || null,
          contra_account_id: direction === 'non_cash' ? form.contra_account_id || null : null,
          classification_account_id: direction === 'fund_disbursement' ? form.classification_account_id || null : null,
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
          {direction === 'non_cash' && (
            <p className="empty-state" style={{ marginTop: 0 }}>
              Records that money is now owed, without any cash moving yet (e.g. a supplier's bill). Pay it off later as a normal Money Out from the
              same payable liability as the Purpose. A partial payment reduces what is owed and does not record the cost again.
            </p>
          )}
          {direction === 'fund_disbursement' && (
            <p className="empty-state" style={{ marginTop: 0 }}>
              Spending money already held for this project's client - not a Nextudio expense. This reduces the Client Fund Liability chosen below,
              never an expense account, even though you can still classify what it was for.
            </p>
          )}
          <div className="form-grid">
            {(direction === 'money_out' || direction === 'transfer' || direction === 'fund_disbursement') && (
              <label className="form-field">
                {direction === 'fund_disbursement' ? 'Paid From (Project Fund)' : 'Paid From'}
                <select value={form.from_cash_account_id} onChange={(e) => update('from_cash_account_id', e.target.value)}>
                  <option value="">Select an account</option>
                  {(direction === 'fund_disbursement' ? cashAccounts.filter((a) => a.kind === 'project_fund') : cashAccounts).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {(direction === 'money_in' || direction === 'transfer') && (
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
                  {direction === 'money_out' || direction === 'fund_disbursement' ? 'Paid To' : direction === 'non_cash' ? 'Owed To' : 'Received From'}
                  <select value={form.counterparty_id} onChange={(e) => update('counterparty_id', e.target.value)}>
                    <option value="">(none)</option>
                    {counterparties.map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.name}
                      </option>
                    ))}
                  </select>
                </label>
                {direction === 'fund_disbursement' ? (
                  <label className="form-field">
                    Client Fund Liability
                    <select value={form.category_account_id} onChange={(e) => update('category_account_id', e.target.value)}>
                      <option value="">Select the liability this reduces</option>
                      {clientFundOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="form-field">
                    {direction === 'non_cash' ? 'Cost Category' : 'Purpose'}
                    <select value={form.category_account_id} onChange={(e) => update('category_account_id', e.target.value)}>
                      <option value="">Select a purpose / category</option>
                      {categoryOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {direction === 'non_cash' && (
                  <label className="form-field">
                    Payable Account
                    <select value={form.contra_account_id} onChange={(e) => update('contra_account_id', e.target.value)}>
                      <option value="">Select a payable account</option>
                      {payableOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {direction === 'fund_disbursement' && (
                  <label className="form-field">
                    Classification
                    <select value={form.classification_account_id} onChange={(e) => update('classification_account_id', e.target.value)}>
                      <option value="">Choose a management category</option>
                      {classificationOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                    <span className="doc-hint">For reporting only (e.g. "Concrete Works") - never posted as an expense.</span>
                  </label>
                )}
                <label className="form-field">
                  Project
                  <select value={form.project_id} onChange={(e) => update('project_id', e.target.value)}>
                    <option value="">{direction === 'fund_disbursement' ? 'Select the project' : '(none - company expense/income)'}</option>
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
            <label className="form-field">
              Reference (bill or receipt number)
              <input value={form.reference} onChange={(e) => update('reference', e.target.value)} />
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
                <dt>{direction === 'money_out' || direction === 'fund_disbursement' ? 'Paid To' : direction === 'non_cash' ? 'Owed To' : 'Received From'}</dt>
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
                <dt>{direction === 'non_cash' ? 'Cost Category' : direction === 'fund_disbursement' ? 'Client Fund Liability' : 'Purpose'}</dt>
                <dd>{findName(direction === 'fund_disbursement' ? clientFundOptions : categoryOptions, form.category_account_id)}</dd>
              </>
            )}
            {direction === 'fund_disbursement' && form.classification_account_id && (
              <>
                <dt>Classification</dt>
                <dd>{findName(classificationOptions, form.classification_account_id)} (reporting only)</dd>
              </>
            )}
            {form.contra_account_id && (
              <>
                <dt>Payable Account</dt>
                <dd>{findName(payableOptions, form.contra_account_id)}</dd>
              </>
            )}
            <dt>Date</dt>
            <dd>{form.transaction_date}</dd>
            {form.reference && <><dt>Reference</dt><dd>{form.reference}</dd></>}
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
              {direction === 'non_cash' &&
                `Debits ${findName(categoryOptions, form.category_account_id)} ${form.amount} · Credits ${findName(payableOptions, form.contra_account_id)} ${form.amount}`}
              {direction === 'fund_disbursement' &&
                `Debits ${findName(clientFundOptions, form.category_account_id)} ${form.amount} · Credits ${findName(cashAccounts, form.from_cash_account_id)} ${form.amount}`}
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
