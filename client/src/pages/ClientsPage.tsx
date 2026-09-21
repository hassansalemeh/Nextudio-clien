import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Client = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  created_at: string
}

function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

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
        body: JSON.stringify({
          name,
          contact_name: contactName,
          email,
          phone,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create client')
      }

      const newClient = await response.json()
      setClients((previousClients) => [newClient, ...previousClients])

      setName('')
      setContactName('')
      setEmail('')
      setPhone('')
    } catch {
      setError('Could not create client.')
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
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="form-field">
              Contact Person
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </label>
            <label className="form-field">
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="form-field">
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
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
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.name}</td>
                  <td>{client.contact_name || '—'}</td>
                  <td>{client.email || '—'}</td>
                  <td>{client.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default ClientsPage
