import { CheckIcon, CloseIcon, PencilIcon } from '../../../shared/components/icons'
import { localDateString } from '../../../shared/lib/timeUtils'
import type { Employee, Project, WorkAssignment, WorkAssignmentEdit } from '../types'

type Props = {
  workAssignmentsLoading: boolean
  workAssignments: WorkAssignment[]
  startEdit: (workAssignment: WorkAssignment) => void
  editingId: string | null
  edit: WorkAssignmentEdit
  setEdit: (edit: WorkAssignmentEdit) => void
  saveEdit: () => void
  setEditingId: (id: string | null) => void
  editError: string
  projects: Project[]
  allEmployees: Employee[]
}

function WorkAssignmentsTable({
  workAssignmentsLoading,
  workAssignments,
  startEdit,
  editingId,
  edit,
  setEdit,
  saveEdit,
  setEditingId,
  editError,
  projects,
  allEmployees,
}: Props) {
  return (
    <div className="card">
      <h2>Work Assignments</h2>
      {workAssignmentsLoading ? (
        <p className="empty-state">Loading work assignments...</p>
      ) : workAssignments.length === 0 ? (
        <p className="empty-state">No work assignments yet.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {workAssignments.map((workAssignment) => (
              <tr key={workAssignment.id}>
                <td>{workAssignment.employee_name}</td>
                <td>{workAssignment.start_date}</td>
                <td>
                  {workAssignment.end_date}
                  {workAssignment.end_date < localDateString() && (
                    <span
                      className="status-badge status-on_hold"
                      style={{ marginLeft: '0.5rem' }}
                      title="This assignment no longer covers today. The employee cannot start a timer or add manual work on this project unless it is extended."
                    >
                      Ended
                    </span>
                  )}
                </td>
                <td className="col-wrap">{workAssignment.description}</td>
                <td>
                  <button type="button" className="btn-sm btn-ghost" onClick={() => startEdit(workAssignment)}>
<PencilIcon /> Edit
</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Kept outside the table on purpose: a whole form doesn't belong inside a horizontally-scrolling
          table row — it would force every column wider to match it and could scroll off-screen. */}
      {editingId && (
        <div className="edit-panel">
          <div className="form-grid">
            <label className="form-field">
              Project
              <select value={edit.project_id} onChange={(e) => setEdit({ ...edit, project_id: e.target.value })}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Employee
              <select value={edit.employee_id} onChange={(e) => setEdit({ ...edit, employee_id: e.target.value })}>
                {allEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              Start Date
              <input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
            </label>
            <label className="form-field">
              End Date
              <input
                type="date"
                value={edit.end_date}
                min={edit.start_date || undefined}
                onChange={(e) => setEdit({ ...edit, end_date: e.target.value })}
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="form-field">
              Task Description
              <textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </label>
          </div>
          <div className="edit-actions">
            <button type="button" className="btn-sm btn-solid" onClick={saveEdit}>
              <CheckIcon /> Save
            </button>
            <button type="button" className="btn-sm btn-ghost" onClick={() => setEditingId(null)}>
              <CloseIcon /> Cancel
            </button>
          </div>
          {editError && <p className="error-message">{editError}</p>}
        </div>
      )}
    </div>
  )
}

export default WorkAssignmentsTable
