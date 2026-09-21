import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

type SummaryRow = {
  project_id: string
  name: string
  fee_status: string
  entered_fee: number | null
  amount: number
  deducted: number
  remaining: number
}

function ProjectFinancialSummaryPage() {
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    function load() {
      fetch(`${API_URL}/api/project-financial-summary`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data) => {
          setRows(data)
          setError('')
        })
        .catch(() => setError('Could not load the financial summary.'))
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
          <p className="empty-state">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="empty-state">No projects yet.</p>
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
