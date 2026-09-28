import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useConfirm } from '../../components/ConfirmDialog'
import { useAccountingBook } from '../BookContext'
import { fetchJson, money, TRANSACTION_STATUS_LABELS } from '../format'

type Line = {
  id: string
  account_id: string
  account_name: string
  account_type: string
  debit: number
  credit: number
  project_id: string | null
  project_name: string | null
  counterparty_id: string | null
  counterparty_name: string | null
  cash_account_id: string | null
  cash_account_name: string | null
  memo: string | null
}

type Entry = {
  id: string
  book_code: string
  entry_date: string
  reference: string | null
  description: string | null
  status: string
  reversal_of_entry_id: string | null
  reversed_by_entry_id: string | null
  lines: Line[]
}

function JournalEntryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { book, loading: bookLoading } = useAccountingBook()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function load() {
    if (!id) return
    fetchJson(`/api/accounting/journal-entries/${id}`)
      .then(setEntry)
      .catch(() => setError('Could not load this journal entry.'))
  }

  useEffect(load, [id])

  async function reverse() {
    if (!entry) return
    const reason = window.prompt('Reason for reversal (optional):') ?? ''
    const confirmed = await confirm({
      title: 'Reverse this journal entry?',
      message:
        'Use this only to correct a mistake - it creates a new, opposite entry, and the original is kept exactly as posted, never edited or deleted. ' +
        'Both stay visible in Journal, but a reversed pair contributes nothing to Dashboard, Project, or Payee totals. ' +
        'For a genuine refund or repeat payment, add it as a new transaction instead - do not reverse this entry for that.',
      confirmLabel: 'Reverse entry',
      tone: 'danger',
    })
    if (!confirmed) return
    setBusy(true)
    setError('')
    try {
      const reversal = await fetchJson(`/api/accounting/journal-entries/${entry.id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || null }),
      })
      navigate(`/accounting/journal/${reversal.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reverse this entry.')
    } finally {
      setBusy(false)
    }
  }

  if (bookLoading || !book) {
    return <p className="empty-state">Loading...</p>
  }

  if (error) {
    return (
      <>
        <p>
          <Link to="/accounting/journal">← Back to Journal</Link>
        </p>
        <p className="error-message">{error}</p>
      </>
    )
  }

  if (!entry) {
    return <p className="empty-state">Loading...</p>
  }

  const currency = book.currency_code
  const totalDebit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0)
  const totalCredit = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0)

  return (
    <>
      <p>
        <Link to="/accounting/journal">← Back to Journal</Link>
      </p>
      <div className="accounting-topbar">
        <h1>{entry.reference || `Journal Entry #${entry.id}`}</h1>
        {/* An entry's status stays "posted" forever once posted - the Reverse action is hidden once
            reversed_by_entry_id shows another entry already reversed this one, not by status. A reversal
            entry (reversal_of_entry_id set) can never itself be reversed - see postingService.ts's doReverse -
            so redoing an original after reversing it by mistake means entering it again as a new transaction. */}
        {entry.status === 'posted' && !entry.reversed_by_entry_id && !entry.reversal_of_entry_id && (
          <button type="button" className="btn-danger" disabled={busy} onClick={reverse}>
            Reverse Entry
          </button>
        )}
      </div>

      <div className="card">
        <p>
          Date: <strong>{entry.entry_date}</strong>
        </p>
        <p>
          Book: <strong>{entry.book_code}</strong>
        </p>
        <p>
          Status: <span className={`status-badge status-${entry.status}`}>{TRANSACTION_STATUS_LABELS[entry.status] ?? entry.status}</span>
          {entry.reversed_by_entry_id && (
            <>
              {' '}
              <span className="status-badge status-inactive">Reversed</span>
            </>
          )}
        </p>
        {entry.description && (
          <p>
            Description: <strong>{entry.description}</strong>
          </p>
        )}
        {entry.reversal_of_entry_id && (
          <p>
            This is a reversal of{' '}
            <Link to={`/accounting/journal/${entry.reversal_of_entry_id}`}>journal entry #{entry.reversal_of_entry_id}</Link>. The original is kept
            exactly as posted; both remain in every report so their effect nets to zero.
          </p>
        )}
        {entry.reversed_by_entry_id && (
          <p>
            This entry was reversed by{' '}
            <Link to={`/accounting/journal/${entry.reversed_by_entry_id}`}>journal entry #{entry.reversed_by_entry_id}</Link>. This entry is kept
            exactly as posted; both remain in every report so their effect nets to zero.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Lines</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Project</th>
              <th>Payee/Payer</th>
              <th>Memo</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line) => (
              <tr key={line.id}>
                <td>{line.account_name}</td>
                <td>{line.project_name || '—'}</td>
                <td>{line.counterparty_name || line.cash_account_name || '—'}</td>
                <td>{line.memo || '—'}</td>
                <td className="accounting-journal-line">{Number(line.debit) > 0 ? money(line.debit, currency) : ''}</td>
                <td className="accounting-journal-line">{Number(line.credit) > 0 ? money(line.credit, currency) : ''}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4}>
                <strong>Total</strong>
              </td>
              <td className="accounting-journal-line">
                <strong>{money(totalDebit, currency)}</strong>
              </td>
              <td className="accounting-journal-line">
                <strong>{money(totalCredit, currency)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

export default JournalEntryDetailPage
