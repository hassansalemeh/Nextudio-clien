import { useEffect, useState } from 'react'
import { CloseIcon } from './icons'

const API_URL = import.meta.env.VITE_API_URL ?? ''
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type EmailHistoryItem = {
  id: string
  recipient: string
  cc: string | null
  subject: string
  message: string | null
  status: 'sent' | 'failed'
  error: string | null
  sent_by_email: string
  sent_at: string
}

type Props = {
  estimateId: string
  clientEmail: string | null
  contactName: string
  projectTitle: string
  onClose: () => void
  // Called with the (possibly updated, e.g. Draft -> Pending) estimate after a successful send
  onSent: (estimate: any) => void
}

function formatSentAt(iso: string) {
  const date = new Date(iso)
  const d = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const t = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${d} at ${t}`
}

function defaultSubject(title: string) {
  return `Quotation - ${title || 'Project'} - Nextudio`
}

function defaultMessage(contactName: string, title: string) {
  return `Dear ${contactName || 'Sir/Madam'},\n\nPlease find attached our quotation for ${title || 'your project'}.\n\nKind regards,\nNextudio Architects`
}

function SendEstimateEmailDialog({ estimateId, clientEmail, contactName, projectTitle, onClose, onSent }: Props) {
  const [history, setHistory] = useState<EmailHistoryItem[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)

  const [to, setTo] = useState(clientEmail ?? '')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(defaultSubject(projectTitle))
  const [message, setMessage] = useState(defaultMessage(contactName, projectTitle))
  const [attachPdf, setAttachPdf] = useState(true)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [justSent, setJustSent] = useState('')

  useEffect(() => {
    fetch(`${API_URL}/api/estimates/${estimateId}/emails`)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: EmailHistoryItem[]) => {
        setHistory(data)
        // Reopening after a previous send: pick up where it left off, rather than the computed defaults
        const last = data.find((item) => item.status === 'sent') ?? data[0]
        if (last) {
          setTo(last.recipient)
          setCc(last.cc ?? '')
          setSubject(last.subject)
          if (last.message) setMessage(last.message)
        }
      })
      .catch(() => undefined)
      .finally(() => setHistoryLoaded(true))
    // Only on the first open for this estimate; the fields are then the admin's to edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setJustSent('')

    if (!to.trim()) return setError('Enter a recipient email address.')
    if (!EMAIL_RE.test(to.trim())) return setError('Enter a valid recipient email address.')
    if (cc.trim() && cc.split(',').some((address) => !EMAIL_RE.test(address.trim()))) {
      return setError('Enter valid CC email address(es), separated by commas.')
    }
    if (!subject.trim()) return setError('Enter a subject.')

    setBusy(true)
    try {
      const response = await fetch(`${API_URL}/api/estimates/${estimateId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), cc: cc.trim() || null, subject: subject.trim(), message, attach_pdf: attachPdf }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Could not send the email.')
      setJustSent(`Sent to ${to.trim()}.`)
      setHistory((previous) => [body.email, ...previous])
      onSent(body.estimate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the email.')
    } finally {
      setBusy(false)
    }
  }

  const lastSent = history.find((item) => item.status === 'sent')

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="send-email-title">
        <div className="modal-header">
          <h2 id="send-email-title">Send Estimate by Email</h2>
          <button type="button" className="doc-icon" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {historyLoaded && lastSent && (
          <p className="doc-hint" style={{ marginBottom: '1rem' }}>
            Last sent: {formatSentAt(lastSent.sent_at)} to {lastSent.recipient} (by {lastSent.sent_by_email})
          </p>
        )}

        <form onSubmit={send} noValidate>
          <div className="form-grid">
            <label className="form-field">
              To
              <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
            </label>
            <label className="form-field">
              CC (optional)
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="e.g. someone@nextudio.co" />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Message
              <textarea className="email-message" value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
          </div>
          <label className="email-attach-check">
            <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
            Attach Quotation PDF
          </label>

          {error && <p className="error-message">{error}</p>}
          {justSent && <p className="doc-saved">{justSent}</p>}

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-sm btn-ghost" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="btn-sm btn-solid" disabled={busy}>
              {busy ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </form>

        {history.length > 0 && (
          <div className="email-history">
            <h3>History</h3>
            <ul>
              {history.map((item) => (
                <li key={item.id}>
                  <span className={`status-badge status-${item.status === 'sent' ? 'approved' : 'rejected'}`}>
                    {item.status === 'sent' ? 'Sent' : 'Failed'}
                  </span>{' '}
                  {formatSentAt(item.sent_at)} to <strong>{item.recipient}</strong>
                  {item.cc ? ` (cc: ${item.cc})` : ''} — by {item.sent_by_email}
                  {item.status === 'failed' && item.error && <div className="email-history-error">{item.error}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default SendEstimateEmailDialog
