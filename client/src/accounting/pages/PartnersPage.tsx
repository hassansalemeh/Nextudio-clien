import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

type Partner = { id: string; name: string; is_active: boolean; paid: number; received: number }

function PartnersPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!book) return
    setLoading(true)
    fetchJson(`/api/accounting/counterparties?book_id=${book.id}&kind=partners`)
      .then(setPartners)
      .catch(() => setError('Could not load partners.'))
      .finally(() => setLoading(false))
  }, [book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <div className="accounting-topbar">
        <h1>Partners</h1>
        <Link to="/accounting/setup" className="btn-pill">
          + Add Partner
        </Link>
      </div>
      <nav className="accounting-subnav">
        <Link to="/accounting/payees" className="accounting-subnav-link">Payees</Link>
        <Link to="/accounting/clients" className="accounting-subnav-link">Clients</Link>
        <span className="accounting-subnav-link active">Partners</span>
      </nav>
      <p className="empty-state" style={{ marginTop: 0 }}>Partner funding into the company and drawings out - kept separate from client funds and revenue.</p>
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : partners.length === 0 ? (
          <p className="empty-state">No partners yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Drawings Out</th>
                <th>Funding In</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/accounting/payees/${p.id}`}>{p.name}</Link>
                    {!p.is_active && <span className="status-badge status-inactive" style={{ marginLeft: '0.5rem' }}>Inactive</span>}
                  </td>
                  <td>{money(p.paid, book.currency_code)}</td>
                  <td>{money(p.received, book.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default PartnersPage
