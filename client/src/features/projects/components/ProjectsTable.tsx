import { Link, useNavigate } from 'react-router-dom'
import { CheckIcon, CloseIcon, PencilIcon, TrashIcon } from '../../../shared/components/icons'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import Spinner from '../../../shared/components/Spinner'
import { FEE_STATUS_OPTIONS, STATUS_LABELS, STATUS_OPTIONS } from '../constants'
import type { Client, Project } from '../types'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export type ProjectEdit = {
  client_id: string
  name: string
  description: string
  total_fee: string
  fee_status: string
  start_date: string
  status: string
}

type Props = {
  loading: boolean
  projects: Project[]
  clients: Client[]
  editingId: string | null
  edit: ProjectEdit
  editError: string
  saving: boolean
  startEdit: (project: Project) => void
  deleteProject: (project: Project) => void
  saveEdit: () => void
  setEditingId: (id: string | null) => void
  setEdit: (edit: ProjectEdit) => void
}

function ProjectsTable({
  loading,
  projects,
  clients,
  editingId,
  edit,
  editError,
  saving,
  startEdit,
  deleteProject,
  saveEdit,
  setEditingId,
  setEdit,
}: Props) {
  const navigate = useNavigate()
  return (
    <div className="card">
      <h2>Existing Projects</h2>
      {loading ? (
        <PageLoader label="Loading projects..." />
      ) : projects.length === 0 ? (
        <EmptyState message="No projects yet." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th className="num">Total Fee</th>
              <th>Fee Status</th>
              <th>Start Date</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => [
              <tr key={project.id} className="clickable-row" onClick={() => navigate(`/projects/${project.id}`)}>
                <td data-label="Project">
                  <Link to={`/projects/${project.id}`} onClick={(event) => event.stopPropagation()}>{project.name}</Link>
                </td>
                <td data-label="Client">{project.client_name}</td>
                <td data-label="Total Fee" className="num">{project.total_fee === null ? '—' : currencyFormatter.format(Number(project.total_fee))}</td>
                <td data-label="Fee Status">
                  <span className={`status-badge status-${project.fee_status}`}>
                    {project.fee_status === 'confirmed' ? 'Confirmed' : 'Pending'}
                  </span>
                </td>
                <td data-label="Start Date">{project.start_date || '—'}</td>
                <td data-label="Status">
                  <span className={`status-badge status-${project.status}`}>
                    {STATUS_LABELS[project.status] ?? project.status}
                  </span>
                </td>
                <td data-label="Actions">
                  <button type="button" className="btn-sm btn-ghost" onClick={(event) => { event.stopPropagation(); startEdit(project) }}>
<PencilIcon /> Edit
</button>{' '}
                  <button type="button" className="btn-sm btn-ghost-danger" onClick={(event) => { event.stopPropagation(); deleteProject(project) }}>
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
                    <button type="button" className="btn-sm btn-solid" disabled={saving} onClick={saveEdit}>
{saving ? <Spinner /> : <CheckIcon />} Save
</button>
                    <button type="button" className="btn-sm btn-ghost" disabled={saving} onClick={() => setEditingId(null)}>
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
  )
}

export default ProjectsTable
