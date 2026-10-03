import { useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { OpenIcon, PlusIcon } from '../../../shared/components/icons'
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
        <PageHeader title="Estimates" description="Prepare and review prices before a client approves the work." />
        <button type="button" className="btn-pill" onClick={() => navigate('/estimates/new')}>
          <PlusIcon /> New Estimate
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
                <th className="num">Total</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((estimate) => (
                <tr key={estimate.id} className="clickable-row" onClick={() => navigate(`/estimates/${estimate.id}`)}>
                  <td data-label="Estimate">{estimate.estimate_number}</td>
                  <td data-label="Client">{estimate.client_name || '—'}</td>
                  <td data-label="Project / Title">{estimate.summary || estimate.title}</td>
                  <td data-label="Date">{estimate.estimate_date}</td>
                  <td data-label="Total" className="num">{formatMoney(estimate.total, estimate.currency)}</td>
                  <td data-label="Status">
                    <span className={`status-badge status-${estimate.status}`}>
                      {ESTIMATE_STATUS_LABELS[estimate.status] ?? estimate.status}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <button type="button" className="btn-sm btn-ghost" onClick={(event) => { event.stopPropagation(); navigate(`/estimates/${estimate.id}`) }}>
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
