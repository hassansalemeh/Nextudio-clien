import { useEffect, useMemo, useState } from 'react'
import { apiGet } from '../api/client'
import { getErrorMessage } from '../lib/apiError'
import { renderFormattedText } from '../lib/formattedText'
import { CloseIcon } from './icons'
import EmptyState from './EmptyState'
import PageLoader from './PageLoader'

type ReuseItem = { text: string; use_count: number; last_used: string | null }

type Props = {
  field: string
  fieldLabel: string
  onClose: () => void
  onInsert: (text: string) => void
}

// Previous text typed into this same section on past estimates, deduplicated server-side. Clicking a card
// inserts it (FormattedTextField confirms first if the field already has content) - bold markers are kept as-is.
function ReuseTextDialog({ field, fieldLabel, onClose, onInsert }: Props) {
  const [items, setItems] = useState<ReuseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    apiGet(`/api/estimates/reuse-text?field=${encodeURIComponent(field)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setItems)
      .catch((err) => setError(getErrorMessage(err, 'Could not load previous text.')))
      .finally(() => setLoading(false))
  }, [field])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.text.toLowerCase().includes(q))
  }, [items, search])

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="reuse-text-title">
        <div className="modal-header">
          <h2 id="reuse-text-title">Reuse previous text — {fieldLabel}</h2>
          <button type="button" className="doc-icon" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <input
          className="reuse-search"
          type="text"
          placeholder="Search previous text..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        {error && <p className="error-message">{error}</p>}

        {loading ? (
          <PageLoader />
        ) : filtered.length === 0 ? (
          <EmptyState message={items.length === 0 ? `No previous ${fieldLabel} text yet.` : 'No matches.'} />
        ) : (
          <ul className="reuse-list">
            {filtered.map((item, index) => (
              <li key={index} className="reuse-item">
                <div className="reuse-item-text">{renderFormattedText(item.text)}</div>
                <div className="reuse-item-footer">
                  <span className="doc-hint">
                    Used {item.use_count} time{item.use_count === 1 ? '' : 's'}
                    {item.last_used ? ` · last ${item.last_used.slice(0, 10)}` : ''}
                  </span>
                  <button type="button" className="btn-sm btn-solid" onClick={() => onInsert(item.text)}>
                    Use this text
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-sm btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ReuseTextDialog
