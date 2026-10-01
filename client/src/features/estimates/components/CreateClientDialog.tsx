import { useState } from 'react'
import { CloseIcon } from '../../../shared/components/icons'
import { createClient } from '../api'
import type { NewClient } from '../types'

type ClientForm = { name: string; contact_name: string; email: string; phone: string; address: string }

const emptyForm = (): ClientForm => ({ name: '', contact_name: '', email: '', phone: '', address: '' })

type Props = {
  onClose: () => void
  onCreated: (client: NewClient) => void
}

// Same fields/validation/endpoint as the Clients page's "Add Client" form (ClientsPage.tsx), just reachable
// without leaving the estimate editor.
function CreateClientDialog({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<ClientForm>(emptyForm())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Client name is required.')

    setBusy(true)
    try {
      const newClient = await createClient(form)
      onCreated(newClient)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create client.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-client-title">
        <div className="modal-header">
          <h2 id="create-client-title">New Client</h2>
          <button type="button" className="doc-icon" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-grid">
            <label className="form-field">
              Client Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </label>
            <label className="form-field">
              Contact Person
              <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </label>
            <label className="form-field">
              Email
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="form-field">
              Phone
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="form-field">
              Address
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
          </div>
          {error && <p className="error-message">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-sm btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-sm btn-solid" disabled={busy}>
              {busy ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateClientDialog
