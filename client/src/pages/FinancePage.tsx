import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

type Transaction = {
  id: string
  type: 'income' | 'expense'
  scope: 'project' | 'general'
  project_id: string | null
  project_name: string | null
  amount: string
  transaction_date: string
  party_name: string
  description: string | null
  created_at: string
}

type Project = {
  id: string
  name: string
}

type Period = 'this_month' | 'last_month' | 'last_3_months' | 'all_time'

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPeriodRange(period: Period): { from: string | null; to: string | null } {
  const now = new Date()

  if (period === 'all_time') {
    return { from: null, to: null }
  }

  if (period === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: formatDate(start), to: formatDate(end) }
  }

  if (period === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: formatDate(start), to: formatDate(end) }
  }

  // last_3_months
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: formatDate(start), to: formatDate(end) }
}

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'all_time', label: 'All Time' },
]

function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState<Period>('this_month')

  const [projects, setProjects] = useState<Project[]>([])

  const [type, setType] = useState<'income' | 'expense'>('income')
  const [scope, setScope] = useState<'project' | 'general'>('general')
  const [projectId, setProjectId] = useState('')
  const [amount, setAmount] = useState('')
  const [transactionDate, setTransactionDate] = useState('')
  const [partyName, setPartyName] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch(`${API_URL}/api/projects`)
        if (!response.ok) {
          throw new Error('Failed to load projects')
        }
        const data = await response.json()
        setProjects(data)
      } catch {
        setError('Could not load projects.')
      }
    }

    loadProjects()
  }, [])

  useEffect(() => {
    async function loadTransactions() {
      setLoading(true)
      try {
        const { from, to } = getPeriodRange(period)
        const params = new URLSearchParams()
        if (from) params.set('from', from)
        if (to) params.set('to', to)

        const response = await fetch(`${API_URL}/api/transactions?${params.toString()}`)
        if (!response.ok) {
          throw new Error('Failed to load transactions')
        }
        const data = await response.json()
        setTransactions(data)
      } catch {
        setError('Could not load transactions.')
      } finally {
        setLoading(false)
      }
    }

    loadTransactions()
  }, [period])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          scope,
          project_id: scope === 'project' ? projectId : null,
          amount: Number(amount),
          transaction_date: transactionDate,
          party_name: partyName,
          description,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to create transaction')
      }

      const newTransaction = await response.json()

      const { from, to } = getPeriodRange(period)
      const inRange = (!from || newTransaction.transaction_date >= from) && (!to || newTransaction.transaction_date <= to)
      if (inRange) {
        setTransactions((previous) => [newTransaction, ...previous])
      }

      setType('income')
      setScope('general')
      setProjectId('')
      setAmount('')
      setTransactionDate('')
      setPartyName('')
      setDescription('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create transaction.')
    }
  }

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const totalExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0)
  const net = totalIncome - totalExpenses

  return (
    <>
      <h1>Finance</h1>

      <div className="card">
        <h2>Add Transaction</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              Type
              <select value={type} onChange={(e) => setType(e.target.value as 'income' | 'expense')} required>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <label className="form-field">
              Scope
              <select
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value as 'project' | 'general')
                  setProjectId('')
                }}
                required
              >
                <option value="general">General Company</option>
                <option value="project">Project</option>
              </select>
            </label>
            {scope === 'project' && (
              <label className="form-field">
                Project
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                  <option value="" disabled>
                    Select a project
                  </option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-field">
              Amount
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              Date
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              Party
              <input value={partyName} onChange={(e) => setPartyName(e.target.value)} required />
            </label>
            <label className="form-field">
              Description / Reason
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn-primary">
            Add Transaction
          </button>
          {error && <p className="error-message">{error}</p>}
        </form>
      </div>

      <div className="card">
        <h2>Financial Overview</h2>
        <div className="form-grid">
          <label className="form-field">
            Period
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>
          Total Income: <strong>{currencyFormatter.format(totalIncome)}</strong>
        </p>
        <p>
          Total Expenses: <strong>{currencyFormatter.format(totalExpenses)}</strong>
        </p>
        <p>
          Net: <strong>{currencyFormatter.format(net)}</strong>
        </p>
      </div>

      <div className="card">
        <h2>Transactions</h2>
        {loading ? (
          <p className="empty-state">Loading transactions...</p>
        ) : transactions.length === 0 ? (
          <p className="empty-state">No transactions for this period.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Project / General</th>
                <th>Party</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.transaction_date}</td>
                  <td>
                    <span
                      className={`status-badge ${transaction.type === 'income' ? 'status-active' : 'status-on_hold'}`}
                    >
                      {transaction.type === 'income' ? 'Income' : 'Expense'}
                    </span>
                  </td>
                  <td>{transaction.scope === 'project' ? transaction.project_name : 'General'}</td>
                  <td>{transaction.party_name}</td>
                  <td>{transaction.description || '—'}</td>
                  <td>{currencyFormatter.format(Number(transaction.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default FinancePage
