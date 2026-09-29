import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { COUNTERPARTY_KIND_LABELS, fetchJson, money } from '../format'

type Counterparty = { id: string; name: string; kind: string; is_active: boolean; paid: number; received: number }

function PayeesPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!book) return
    setLoading(true)
    fetchJson(`/api/accounting/counterparties?book_id=${book.id}&kind=payees`)
      .then(setCounterparties)
      .catch(() => setError('Could not load payees.'))
      .finally(() => setLoading(false))
  }, [book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <div className="accounting-topbar">
        <h1>Payees</h1>
        <Link to="/accounting/setup" className="btn-pill">
          + Add Payee
        </Link>
      </div>
      <nav className="accounting-subnav">
        <span className="accounting-subnav-link active">Payees</span>
        <Link to="/accounting/clients" className="accounting-subnav-link">Clients</Link>
        <Link to="/accounting/partners" className="accounting-subnav-link">Partners</Link>
      </nav>
      <p className="empty-state" style={{ marginTop: 0 }}>Suppliers, contractors, consultants, workers, and employees - money paid FROM Nextudio/projects.</p>
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : counterparties.length === 0 ? (
          <p className="empty-state">No payees yet. Add one in Setup.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Total Paid</th>
                <th>Total Received</th>
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
                  <td>{money(cp.paid, book.currency_code)}</td>
                  <td>{money(cp.received, book.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default PayeesPage
