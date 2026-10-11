import { formatLongDate } from '../../../shared/lib/timeUtils'
import type { CreatedDayOffRequest } from '../types'

type Props = {
  request: CreatedDayOffRequest
  onClose: () => void
}

// Shown right after a successful submit. Opening a link is entirely the employee's own action -
// nothing here sends a message automatically.
function NotifyWhatsAppStep({ request, onClose }: Props) {
  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="notify-whatsapp-title">
        <div className="modal-header">
          <h2 id="notify-whatsapp-title">Request submitted</h2>
        </div>
        <p className="doc-hint">
          Your request for {formatLongDate(request.request_date)} is waiting for approval. Let an admin know on WhatsApp:
        </p>

        {request.whatsappLinks.length === 0 ? (
          <p className="doc-hint">No admin WhatsApp number is set up yet - they'll still see this on their Day-off requests page.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '1rem 0' }}>
            {request.whatsappLinks.map((link) => (
              <a key={link.admin} className="btn-sm btn-outline" href={link.url} target="_blank" rel="noreferrer">
                Notify {link.admin} on WhatsApp
              </a>
            ))}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn-sm btn-solid" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotifyWhatsAppStep
