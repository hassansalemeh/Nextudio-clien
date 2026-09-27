import { useEffect, useState } from 'react'
import { PencilIcon } from '../components/icons'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Client = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
}

type ClientForm = { name: string; contact_name: string; email: string; phone: string; address: string }

const emptyForm = (): ClientForm => ({ name: '', contact_name: '', email: '', phone: '', address: '' })

function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState<ClientForm>(emptyForm())

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<ClientForm>(emptyForm())
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadClients() {
      try {
        const response = await fetch(`${API_URL}/api/clients`)
        if (!response.ok) {
          throw new Error('Failed to load clients')
        }
        const data = await response.json()
        setClients(data)
      } catch {
        setError('Could not load clients.')
      } finally {
        setLoading(false)
      }
    }

    loadClients()
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to create client')
      }

      const newClient = await response.json()
      setClients((previousClients) => [newClient, ...previousClients])
      setForm(emptyForm())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create client.')
    }
  }

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
      const response = await fetch(`${API_URL}/api/clients/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Could not update client.')
      setClients((previous) => previous.map((c) => (c.id === editingId ? body : c)))
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update client.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1>Clients</h1>

      <div className="card">
        <h2>Add Client</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              Client Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
          <button type="submit" className="btn-primary">
            Add Client
          </button>
          {error && <p className="error-message">{error}</p>}
        </form>
      </div>

      <div className="card">
        <h2>Existing Clients</h2>
        {loading ? (
          <p className="empty-state">Loading clients...</p>
        ) : clients.length === 0 ? (
          <p className="empty-state">No clients yet.</p>
        ) : (
          <table className="data-table">
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
                          Save
                        </button>
                        <button type="button" className="btn-sm btn-ghost" disabled={saving} onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                      {editError && <p className="error-message">{editError}</p>}
                    </td>
                  </tr>
                ) : (
                  <tr key={client.id}>
                    <td>{client.name}</td>
                    <td>{client.contact_name || '—'}</td>
                    <td>{client.email || '—'}</td>
                    <td>{client.phone || '—'}</td>
                    <td>{client.address || '—'}</td>
                    <td>
                      <button type="button" className="btn-sm btn-ghost" onClick={() => startEdit(client)}>
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
