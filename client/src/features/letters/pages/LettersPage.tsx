import { useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { OpenIcon, PlusIcon } from '../../../shared/components/icons'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { useNavigate } from 'react-router-dom'
import { fetchLetters } from '../api'
import type { LetterListItem } from '../types'

function LettersPage() {
  const navigate = useNavigate()
  const [letters, setLetters] = useState<LetterListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchLetters()
      .then(setLetters)
      .catch((err) => setError(getErrorMessage(err, 'Could not load letters.')))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div className="doc-topbar">
        <PageHeader title="Letters" description="Plain business letters, ready to print or send." />
        <button type="button" className="btn-pill" onClick={() => navigate('/letters/new')}>
          <PlusIcon /> New Letter
        </button>
      </div>

      <div className="card">
        {error && <p className="error-message">{error}</p>}
        {loading ? (
          <PageLoader label="Loading letters..." />
        ) : letters.length === 0 ? (
          <EmptyState message="No letters yet." actionLabel="New Letter" onAction={() => navigate('/letters/new')} />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Letter Number</th>
                <th>Recipient</th>
                <th>Subject</th>
                <th>Date</th>
                <th>Issued By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {letters.map((letter) => (
                <tr key={letter.id} className="clickable-row" onClick={() => navigate(`/letters/${letter.id}`)}>
                  <td data-label="Letter">{letter.letter_number}</td>
                  <td data-label="Recipient">{letter.recipient_name}</td>
                  <td data-label="Subject">{letter.subject}</td>
                  <td data-label="Date">{letter.letter_date}</td>
                  <td data-label="Issued By">{letter.issued_by_admin}</td>
                  <td data-label="Actions">
                    <button type="button" className="btn-sm btn-ghost" onClick={(event) => { event.stopPropagation(); navigate(`/letters/${letter.id}`) }}>
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

export default LettersPage
