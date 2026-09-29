import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

// Clients are kept conceptually separate from Payees: a client's number is their receivable-vs-advance
// control balance (computed from their COMPLETE historical running balance, never a single target account
// code a line happened to post to - see the 2026-09-29 historical reporting correction), never a "paid" figure.
type Client = { id: string; name: string; is_active: boolean; net_balance: number; state: 'receivable' | 'advance_held' | 'settled' }

const STATE_LABEL: Record<Client['state'], string> = {
  receivable: 'Owes Nextudio (receivable)',
  advance_held: 'Nextudio holds funds (advance)',
  settled: 'Settled',
}

function ClientsPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!book) return
    setLoading(true)
    fetchJson(`/api/accounting/counterparties?book_id=${book.id}&kind=clients`)
      .then(setClients)
      .catch(() => setError('Could not load clients.'))
      .finally(() => setLoading(false))
  }, [book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <div className="accounting-topbar">
        <h1>Clients</h1>
        <Link to="/accounting/setup" className="btn-pill">
          + Add Client
        </Link>
      </div>
      <nav className="accounting-subnav">
        <Link to="/accounting/payees" className="accounting-subnav-link">Payees</Link>
        <span className="accounting-subnav-link active">Clients</span>
        <Link to="/accounting/partners" className="accounting-subnav-link">Partners</Link>
      </nav>
      <p className="empty-state" style={{ marginTop: 0 }}>
        Client funding, receivable, and advance/held-funds state - never shown as a payee, never counted as revenue.
      </p>
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : clients.length === 0 ? (
          <p className="empty-state">No clients yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Balance</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/accounting/payees/${c.id}`}>{c.name}</Link>
                    {!c.is_active && <span className="status-badge status-inactive" style={{ marginLeft: '0.5rem' }}>Inactive</span>}
                  </td>
                  <td>{money(Math.abs(c.net_balance), book.currency_code)}</td>
                  <td>{STATE_LABEL[c.state]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default ClientsPage
