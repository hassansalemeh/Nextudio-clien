import { useEffect, useState } from 'react'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { fetchProjectFinancialSummary } from '../api'
import type { SummaryRow } from '../types'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function ProjectFinancialSummaryPage() {
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    function load() {
      fetchProjectFinancialSummary()
        .then((data) => {
          setRows(data)
          setError('')
        })
        .catch((err) => setError(getErrorMessage(err, 'Could not load the financial summary.')))
        .finally(() => setLoading(false))
    }

    load()
    // Numbers can change in another tab or by another admin: refresh when this tab is shown again
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [])

  const unconfirmed = rows.filter((row) => row.fee_status === 'pending' && row.entered_fee !== null && row.entered_fee > 0)

  return (
    <>
      <h1>Project Financial Summary</h1>

      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <EmptyState message="No projects yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Project Amount</th>
                <th>Labor Cost Deducted</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.project_id}>
                  <td>{row.name}</td>
                  <td>{currencyFormatter.format(row.amount)}</td>
                  <td>{currencyFormatter.format(row.deducted)}</td>
                  <td style={{ color: row.remaining < 0 ? '#b3261e' : undefined, fontWeight: 600 }}>
                    {currencyFormatter.format(row.remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {unconfirmed.length > 0 && (
          <p className="empty-state">
            {unconfirmed.map((row) => row.name).join(', ')} {unconfirmed.length === 1 ? 'has' : 'have'} a fee entered but{' '}
            {unconfirmed.length === 1 ? 'is' : 'are'} still Pending, so the amount counts as $0. Set Fee Status to Confirmed on
            the Projects page to count it.
          </p>
        )}
      </div>
    </>
  )
}

export default ProjectFinancialSummaryPage
