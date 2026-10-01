import { useEffect, useState } from 'react'
import { OpenIcon } from '../../../shared/components/icons'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { useNavigate } from 'react-router-dom'
import { fetchEstimates } from '../api'
import { ESTIMATE_STATUS_LABELS } from '../constants'
import type { EstimateListItem } from '../types'

function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

function EstimatesPage() {
  const navigate = useNavigate()
  const [estimates, setEstimates] = useState<EstimateListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchEstimates()
      .then(setEstimates)
      .catch((err) => setError(getErrorMessage(err, 'Could not load estimates.')))
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
          <PageLoader label="Loading estimates..." />
        ) : estimates.length === 0 ? (
          <EmptyState
            message="No open estimates. Approved estimates move to Invoices."
            actionLabel="New Estimate"
            onAction={() => navigate('/estimates/new')}
          />
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
                      {ESTIMATE_STATUS_LABELS[estimate.status] ?? estimate.status}
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
