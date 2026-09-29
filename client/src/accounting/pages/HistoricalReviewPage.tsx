import { useEffect, useState } from 'react'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money } from '../format'

// Every PRESERVED_AMBIGUOUS historical line, visible for management to resolve later using paperwork/
// knowledge - never converted to a guessed category. See the 100% coverage audit (2026-09-29).
type ReviewItem = {
  book_code: string
  legacy_jv_id: number
  legacy_value_date: string | null
  legacy_account_number: string | null
  legacy_account_name: string | null
  amount: number
  legacy_job_name: string | null
  counterparty_name: string | null
  tentative_class: string
  reason: string | null
}

function HistoricalReviewPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!book) return
    setLoading(true)
    fetchJson(`/api/accounting/historical-review-needed?book_id=${book.id}`)
      .then(setItems)
      .catch(() => setError('Could not load the historical review list.'))
      .finally(() => setLoading(false))
  }, [book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <div className="accounting-topbar">
        <h1>Historical Review Needed</h1>
      </div>
      <p className="empty-state" style={{ marginTop: 0 }}>
        {items.length} imported Polypus line{items.length === 1 ? '' : 's'} whose business meaning could not be confirmed from source structure alone (account
        number/type, JobID, voucher type, RCV receipt/payment records, and matching-deposit evidence). Amounts and legacy identity are unchanged and exact -
        these are visible so they can be resolved with paperwork or institutional knowledge, never guessed.
      </p>
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : items.length === 0 ? (
          <p className="empty-state">Nothing to review.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Book</th>
                <th>Date</th>
                <th>JVID</th>
                <th>Legacy Account</th>
                <th>Amount</th>
                <th>Job</th>
                <th>Counterparty</th>
                <th>Tentative Class</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={`${item.book_code}-${item.legacy_jv_id}-${i}`}>
                  <td>{item.book_code}</td>
                  <td>{item.legacy_value_date ?? '—'}</td>
                  <td>{item.legacy_jv_id}</td>
                  <td>
                    {item.legacy_account_number} {item.legacy_account_name}
                  </td>
                  <td>{money(item.amount, book.currency_code)}</td>
                  <td>{item.legacy_job_name ?? '—'}</td>
                  <td>{item.counterparty_name ?? '—'}</td>
                  <td>{item.tentative_class}</td>
                  <td style={{ maxWidth: 320, fontSize: '0.85em' }}>{item.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default HistoricalReviewPage
