import { useEffect, useState } from 'react'
import { OpenIcon } from '../components/icons'
import { useNavigate } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Estimate = {
  id: string
  estimate_number: string
  title: string
  summary: string | null
  client_name: string | null
  estimate_date: string
  currency: string
  status: string
  total: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

function EstimatesPage() {
  const navigate = useNavigate()
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/api/estimates`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setEstimates)
      .catch(() => setError('Could not load estimates.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="doc-topbar">
        <h1>Estimates</h1>
        <button type="button" className="btn-pill" onClick={() => navigate('/estimates/new')}>
          New Estimate
        </button>
      </div>

      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading estimates...</p>
        ) : estimates.length === 0 ? (
          <p className="empty-state">No open estimates. Approved estimates move to Invoices.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Estimate Number</th>
                <th>Client</th>
                <th>Project / Title</th>
                <th>Date</th>
                <th>Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((estimate) => (
                <tr key={estimate.id}>
                  <td>{estimate.estimate_number}</td>
                  <td>{estimate.client_name || '—'}</td>
                  <td>{estimate.summary || estimate.title}</td>
                  <td>{estimate.estimate_date}</td>
                  <td>{formatMoney(estimate.total, estimate.currency)}</td>
                  <td>
                    <span className={`status-badge status-${estimate.status}`}>
                      {STATUS_LABELS[estimate.status] ?? estimate.status}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => navigate(`/estimates/${estimate.id}`)}>
Open <OpenIcon />
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

export default EstimatesPage
