import { useEffect, useState } from 'react'
import { useConfirm } from '../components/ConfirmDialog'
import { CheckIcon, CloseIcon, PencilIcon, TrashIcon } from '../components/icons'
import { Link } from 'react-router-dom'

const API_URL = import.meta.env.VITE_API_URL ?? ''

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
  total_fee: string | null
  fee_status: string
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

const FEE_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending / Unconfirmed' },
  { value: 'confirmed', label: 'Confirmed' },
]

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  completed: 'Completed',
  on_hold: 'On Hold',
}

function ProjectsPage() {
  const confirm = useConfirm()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [clients, setClients] = useState<Client[]>([])

  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [totalFee, setTotalFee] = useState('')
  const [feeStatus, setFeeStatus] = useState('pending')
  const [startDate, setStartDate] = useState('')
  const [status, setStatus] = useState('planning')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({
    client_id: '',
    name: '',
    description: '',
    total_fee: '',
    fee_status: 'pending',
    start_date: '',
    status: 'planning',
  })
  const [editError, setEditError] = useState('')

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
          total_fee: totalFee === '' ? null : Number(totalFee),
          fee_status: feeStatus,
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
      setFeeStatus('pending')
      setStartDate('')
      setStatus('planning')
    } catch {
      setError('Could not create project.')
    }
  }

  function startEdit(project: Project) {
    setEditError('')
    setEditingId(project.id)
    setEdit({
      client_id: project.client_id,
      name: project.name,
      description: project.description ?? '',
      total_fee: project.total_fee ?? '',
      fee_status: project.fee_status,
      start_date: project.start_date ?? '',
      status: project.status,
    })
  }

  async function deleteProject(project: Project) {
    const confirmed = await confirm({
      title: `Delete "${project.name}"?`,
      message:
        'This permanently deletes the project and everything related to it: its assignments, all recorded time entries, its financial transactions, and its invoice (with any payments) and the quotation it was created from. This cannot be undone.\n\nThe client and employees are kept.',
      confirmLabel: 'Delete project',
      tone: 'danger',
    })
    if (!confirmed) return

    setError('')
    try {
      const response = await fetch(`${API_URL}/api/projects/${project.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to delete project')
      }
      setProjects((previous) => previous.filter((item) => item.id !== project.id))
      if (editingId === project.id) setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete project.')
    }
  }

  async function saveEdit() {
    setEditError('')
    if (!edit.client_id) return setEditError('Client is required.')
    if (!edit.name.trim()) return setEditError('Project name is required.')
    const hasFee = edit.total_fee !== ''
    const fee = Number(edit.total_fee)
    if (hasFee && (Number.isNaN(fee) || fee < 0)) return setEditError('Total fee must be a non-negative number.')
    if (edit.fee_status === 'confirmed' && !hasFee) return setEditError('Enter the fee to confirm it.')

    try {
      const response = await fetch(`${API_URL}/api/projects/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...edit, total_fee: hasFee ? fee : null, start_date: edit.start_date || null }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to update project')
      }
      const updated = await response.json()
      setProjects((previous) => previous.map((project) => (project.id === updated.id ? { ...project, ...updated } : project)))
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update project.')
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
              Fee Status
              <select value={feeStatus} onChange={(e) => setFeeStatus(e.target.value)}>
                {FEE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Total Fee
              <input
                type="number"
                min="0"
                step="0.01"
                value={totalFee}
                onChange={(e) => {
                  // Entering a fee on a pending project confirms it by default (the admin can switch it back)
                  if (feeStatus === 'pending' && totalFee === '' && e.target.value !== '') setFeeStatus('confirmed')
                  setTotalFee(e.target.value)
                }}
                required={feeStatus === 'confirmed'}
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
          <p className="empty-state">Only a Confirmed fee counts as project amount in the Financial Summary.</p>
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
                <th>Fee Status</th>
                <th>Start Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => [
                <tr key={project.id}>
                  <td>
                    <Link to={`/projects/${project.id}`}>{project.name}</Link>
                  </td>
                  <td>{project.client_name}</td>
                  <td>{project.total_fee === null ? '—' : currencyFormatter.format(Number(project.total_fee))}</td>
                  <td>
                    <span className={`status-badge status-${project.fee_status}`}>
                      {project.fee_status === 'confirmed' ? 'Confirmed' : 'Pending'}
                    </span>
                  </td>
                  <td>{project.start_date || '—'}</td>
                  <td>
                    <span className={`status-badge status-${project.status}`}>
                      {STATUS_LABELS[project.status] ?? project.status}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => startEdit(project)}>
<PencilIcon /> Edit
</button>{' '}
                    <button type="button" className="btn-sm btn-ghost-danger" onClick={() => deleteProject(project)}>
<TrashIcon /> Delete
</button>
                  </td>
                </tr>,
                editingId === project.id && (
                  <tr key={`${project.id}-edit`}>
                    <td colSpan={7}>
                      <div className="form-grid">
                        <label className="form-field">
                          Client
                          <select value={edit.client_id} onChange={(e) => setEdit({ ...edit, client_id: e.target.value })}>
                            {clients.map((client) => (
                              <option key={client.id} value={client.id}>
                                {client.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-field">
                          Project Name
                          <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Description
                          <input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Fee Status
                          <select value={edit.fee_status} onChange={(e) => setEdit({ ...edit, fee_status: e.target.value })}>
                            {FEE_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-field">
                          Total Fee
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={edit.total_fee}
                            onChange={(e) => {
                              const becameFilled = edit.total_fee === '' && e.target.value !== ''
                              setEdit({
                                ...edit,
                                total_fee: e.target.value,
                                fee_status: becameFilled && edit.fee_status === 'pending' ? 'confirmed' : edit.fee_status,
                              })
                            }}
                          />
                        </label>
                        <label className="form-field">
                          Start Date
                          <input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Status
                          <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="empty-state">Only a Confirmed fee counts as project amount in the Financial Summary.</p>
                      <button type="button" className="btn-sm btn-solid" onClick={saveEdit}>
<CheckIcon /> Save
</button>
                      <button type="button" className="btn-sm btn-ghost" onClick={() => setEditingId(null)}>
<CloseIcon /> Cancel
</button>
                      {editError && <p className="error-message">{editError}</p>}
                    </td>
                  </tr>
                ),
              ])}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

export default ProjectsPage
