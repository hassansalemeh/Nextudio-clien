import { useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { CloseIcon, PencilIcon, PlusIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { useToast } from '../../../shared/components/Toast'
import { useAsyncAction } from '../../../shared/hooks/useAsyncAction'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { createClient, fetchClients, updateClient } from '../api'
import type { Client, ClientForm } from '../types'

const emptyForm = (): ClientForm => ({ name: '', contact_name: '', email: '', phone: '', address: '' })

function ClientsPage() {
  const toast = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState<ClientForm>(emptyForm())
  const [formOpen, setFormOpen] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<ClientForm>(emptyForm())
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadClients() {
      try {
        const data = await fetchClients()
        setClients(data)
      } catch (err) {
        setError(getErrorMessage(err, 'Could not load clients.'))
      } finally {
        setLoading(false)
      }
    }

    loadClients()
  }, [])

  const [handleSubmit, submitting] = useAsyncAction(async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    try {
      const newClient = await createClient(form)
      setClients((previousClients) => [newClient, ...previousClients])
      setForm(emptyForm())
      setFormOpen(false)
      toast.success('Client added.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not create client.')
      setError(message)
      toast.error(message)
    }
  })

  function startEdit(client: Client) {
    setEditError('')
    setEditingId(client.id)
    setEdit({
      name: client.name,
      contact_name: client.contact_name ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
    })
  }

  async function saveEdit() {
    setEditError('')
    if (!edit.name.trim()) return setEditError('Client name is required.')

    setSaving(true)
    try {
      const updated = await updateClient(editingId!, edit)
      setClients((previous) => previous.map((c) => (c.id === editingId ? updated : c)))
      setEditingId(null)
      toast.success('Client updated.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not update client.')
      setEditError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Keep client details together so you can find and update them quickly. Select a client to see and edit all details."
        action={<button type="button" className="btn-primary header-action" aria-expanded={formOpen} aria-controls="client-entry" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? <CloseIcon /> : <PlusIcon />} {formOpen ? 'Close form' : 'Add Client'}
        </button>}
      />

      {formOpen && <div className="card entry-panel" id="client-entry">
        <h2>Add Client</h2>
        <form onSubmit={handleSubmit}>
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
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting && <Spinner />} Add Client
          </button>
          {error && <p className="error-message">{error}</p>}
        </form>
      </div>}

      <div className="card">
        <h2>Existing Clients</h2>
        {loading ? (
          <PageLoader label="Loading clients..." />
        ) : clients.length === 0 ? (
          <EmptyState message="No clients yet." />
        ) : (
          <table className="data-table clients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Address</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) =>
                editingId === client.id ? (
                  <tr key={`${client.id}-edit`}>
                    <td colSpan={6}>
                      <div className="form-grid">
                        <label className="form-field">
                          Client Name
                          <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Contact Person
                          <input value={edit.contact_name} onChange={(e) => setEdit({ ...edit, contact_name: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Email
                          <input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Phone
                          <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Address
                          <input value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
                        </label>
                      </div>
                      <div className="edit-actions">
                        <button type="button" className="btn-sm btn-solid" disabled={saving} onClick={saveEdit}>
                          {saving && <Spinner />} Save
                        </button>
                        <button type="button" className="btn-sm btn-ghost" disabled={saving} onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                      {editError && <p className="error-message">{editError}</p>}
                    </td>
                  </tr>
                ) : (
                  <tr key={client.id} className="clickable-row" onClick={() => startEdit(client)}>
                    <td data-label="Name"><button type="button" className="row-main-button" onClick={(event) => { event.stopPropagation(); startEdit(client) }}>{client.name}</button></td>
                    <td data-label="Contact">{client.contact_name || '—'}</td>
                    <td data-label="Email">{client.email || '—'}</td>
                    <td data-label="Phone">{client.phone || '—'}</td>
                    <td data-label="Address">{client.address || '—'}</td>
                    <td data-label="Actions">
                      <button type="button" className="btn-sm btn-ghost" onClick={(event) => { event.stopPropagation(); startEdit(client) }}>
                        <PencilIcon /> Edit
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default ClientsPage
