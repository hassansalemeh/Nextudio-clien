import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money, TRANSACTION_STATUS_LABELS } from '../format'

type JournalEntry = {
  id: string
  book_code: string
  entry_date: string
  reference: string | null
  description: string | null
  status: string
  reversal_of_entry_id: string | null
  reversed_by_entry_id: string | null
  total_debit: number
  total_credit: number
}

function JournalPage() {
  const { book, loading: bookLoading } = useAccountingBook()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!book) return
    setLoading(true)
    fetchJson(`/api/accounting/journal-entries?book_id=${book.id}`)
      .then(setEntries)
      .catch(() => setError('Could not load the journal.'))
      .finally(() => setLoading(false))
  }, [book])

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  return (
    <>
      <h1>Journal</h1>
      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <p className="empty-state">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="empty-state">No journal entries yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Description</th>
                <th>Status</th>
                <th>Debit</th>
                <th>Credit</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.entry_date}</td>
                  <td>
                    <Link to={`/accounting/journal/${entry.id}`}>{entry.reference || `#${entry.id}`}</Link>
                  </td>
                  <td>{entry.description || '—'}</td>
                  <td>
                    {/* status stays "posted" forever once posted - whether an entry has been reversed is a
                        separate fact (reversed_by_entry_id), shown as its own badge rather than a status value */}
                    <span className={`status-badge status-${entry.status}`}>{TRANSACTION_STATUS_LABELS[entry.status] ?? entry.status}</span>{' '}
                    {entry.reversed_by_entry_id && (
                      <Link to={`/accounting/journal/${entry.reversed_by_entry_id}`} className="status-badge status-inactive">
                        Reversed
                      </Link>
                    )}
                    {entry.reversal_of_entry_id && <span className="status-badge status-draft">Reversal</span>}
                  </td>
                  <td className="accounting-journal-line">{money(entry.total_debit, book.currency_code)}</td>
                  <td className="accounting-journal-line">{money(entry.total_credit, book.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default JournalPage
