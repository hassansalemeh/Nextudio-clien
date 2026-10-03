import { lazy, Suspense, useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { fetchProjectFinancialSummary } from '../api'
import type { SummaryRow } from '../types'

const ProjectValueChart = lazy(() => import('../../../shared/components/ProjectValueChart'))

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
      <PageHeader title="Financial Summary" description="How much each project earned compared to what it cost in staff time." />

      {!loading && rows.length > 0 && (
        <Suspense fallback={<PageLoader label="Loading chart..." />}>
          <div className="financial-chart"><ProjectValueChart projects={rows} limit={8} /></div>
        </Suspense>
      )}

      <div className="card">
        <h2>All project figures</h2>
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
                <th className="num">Project Amount</th>
                <th className="num">Labor Cost Deducted</th>
                <th className="num">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.project_id}>
                  <td data-label="Project">{row.name}</td>
                  <td data-label="Project Amount" className="num">{currencyFormatter.format(row.amount)}</td>
                  <td data-label="Labor Cost" className="num">{currencyFormatter.format(row.deducted)}</td>
                  <td data-label="Remaining" className={'num' + (row.remaining < 0 ? ' negative' : '')} style={{ fontWeight: 600 }}>
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
