import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

type Project = {
  id: string
  client_id: string
  client_name: string
  name: string
  description: string | null
  total_fee: string
  start_date: string | null
  status: string
  created_at: string
}

type Client = {
  id: string
  name: string
}

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
]

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  completed: 'Completed',
  on_hold: 'On Hold',
}

function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [clients, setClients] = useState<Client[]>([])

  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [totalFee, setTotalFee] = useState('')
  const [startDate, setStartDate] = useState('')
  const [status, setStatus] = useState('planning')

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch(`${API_URL}/api/projects`)
        if (!response.ok) {
          throw new Error('Failed to load projects')
        }
        const data = await response.json()
        setProjects(data)
      } catch {
        setError('Could not load projects.')
      } finally {
        setLoading(false)
      }
    }

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
      }
    }

    loadProjects()
    loadClients()
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          name,
          description,
          total_fee: Number(totalFee),
          start_date: startDate || null,
          status,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create project')
      }

      const newProject = await response.json()
      setProjects((previousProjects) => [newProject, ...previousProjects])

      setClientId('')
      setName('')
      setDescription('')
      setTotalFee('')
      setStartDate('')
      setStatus('planning')
    } catch {
      setError('Could not create project.')
    }
  }

  return (
    <>
      <h1>Projects</h1>

      <div className="card">
        <h2>Add Project</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              Client
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="" disabled>
                  Select a client
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Project Name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="form-field">
              Description
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="form-field">
              Total Fee
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalFee}
                onChange={(e) => setTotalFee(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              Start Date
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="form-field">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} required>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="btn-primary">
            Add Project
          </button>
          {error && <p className="error-message">{error}</p>}
        </form>
      </div>

      <div className="card">
        <h2>Existing Projects</h2>
        {loading ? (
          <p className="empty-state">Loading projects...</p>
        ) : projects.length === 0 ? (
          <p className="empty-state">No projects yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Total Fee</th>
                <th>Start Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{project.client_name}</td>
                  <td>{currencyFormatter.format(Number(project.total_fee))}</td>
                  <td>{project.start_date || '—'}</td>
                  <td>
                    <span className={`status-badge status-${project.status}`}>
                      {STATUS_LABELS[project.status] ?? project.status}
                    </span>
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

export default ProjectsPage
