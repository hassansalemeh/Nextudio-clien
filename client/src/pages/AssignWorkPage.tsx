import { useEffect, useState } from 'react'
import { CheckIcon, CloseIcon, PencilIcon } from '../components/icons'
import { localDateString } from '../timeUtils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Project = {
  id: string
  name: string
}

type Employee = {
  id: string
  full_name: string
}

type Assignment = {
  id: string
  employee_id: string
  employee_name: string
  position: string
}

type WorkAssignment = {
  id: string
  project_id: string
  employee_id: string
  employee_name: string
  start_date: string
  end_date: string
  description: string
}

function AssignWorkPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsError, setAssignmentsError] = useState('')
  const [employeeToAssign, setEmployeeToAssign] = useState('')

  const [allEmployees, setAllEmployees] = useState<Employee[]>([])

  const [workAssignments, setWorkAssignments] = useState<WorkAssignment[]>([])
  const [workAssignmentsLoading, setWorkAssignmentsLoading] = useState(false)
  const [workAssignmentsError, setWorkAssignmentsError] = useState('')

  const [workEmployeeId, setWorkEmployeeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [taskDescription, setTaskDescription] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ project_id: '', employee_id: '', start_date: '', end_date: '', description: '' })
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
        setWorkAssignmentsError('Could not load projects.')
      }
    }

    async function loadEmployees() {
      try {
        const response = await fetch(`${API_URL}/api/employees`)
        if (!response.ok) {
          throw new Error('Failed to load employees')
        }
        const data = await response.json()
        setAllEmployees(data)
      } catch {
        setAssignmentsError('Could not load employees.')
      }
    }

    loadProjects()
    loadEmployees()
  }, [])

  useEffect(() => {
    if (!projectId) {
      setAssignments([])
      setWorkAssignments([])
      return
    }

    async function loadAssignments() {
      try {
        const response = await fetch(`${API_URL}/api/projects/${projectId}/assignments`)
        if (!response.ok) {
          throw new Error('Failed to load assignments')
        }
        const data = await response.json()
        setAssignments(data)
      } catch {
        setAssignmentsError('Could not load assigned employees.')
      }
    }

    async function loadWorkAssignments() {
      setWorkAssignmentsLoading(true)
      try {
        const response = await fetch(`${API_URL}/api/work-assignments?project_id=${projectId}`)
        if (!response.ok) {
          throw new Error('Failed to load work assignments')
        }
        const data = await response.json()
        setWorkAssignments(data)
      } catch {
        setWorkAssignmentsError('Could not load work assignments.')
      } finally {
        setWorkAssignmentsLoading(false)
      }
    }

    loadAssignments()
    loadWorkAssignments()
  }, [projectId])

  async function handleAssignSubmit(event: React.FormEvent) {
    event.preventDefault()
    setAssignmentsError('')

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeToAssign }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to assign employee')
      }

      const newAssignment = await response.json()
      setAssignments((previous) => {
        const withoutExisting = previous.filter((a) => a.employee_id !== newAssignment.employee_id)
        return [...withoutExisting, newAssignment].sort((a, b) => a.employee_name.localeCompare(b.employee_name))
      })
      setEmployeeToAssign('')
    } catch (err) {
      setAssignmentsError(err instanceof Error ? err.message : 'Could not assign employee.')
    }
  }

  async function handleWorkAssignmentSubmit(event: React.FormEvent) {
    event.preventDefault()
    setWorkAssignmentsError('')

    if (!workEmployeeId) {
      setWorkAssignmentsError('Please select an employee.')
      return
    }
    if (!startDate) {
      setWorkAssignmentsError('Start date is required.')
      return
    }
    if (!endDate) {
      setWorkAssignmentsError('End date is required.')
      return
    }
    if (endDate < startDate) {
      setWorkAssignmentsError('End date cannot be before start date.')
      return
    }
    if (!taskDescription.trim()) {
      setWorkAssignmentsError('Task description is required.')
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/work-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          employee_id: workEmployeeId,
          start_date: startDate,
          end_date: endDate,
          description: taskDescription.trim(),
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to assign work')
      }

      const newWorkAssignment = await response.json()
      setWorkAssignments((previous) => [newWorkAssignment, ...previous])

      setWorkEmployeeId('')
      setStartDate('')
      setEndDate('')
      setTaskDescription('')
    } catch (err) {
      setWorkAssignmentsError(err instanceof Error ? err.message : 'Could not assign work.')
    }
  }

  function startEdit(workAssignment: WorkAssignment) {
    setEditError('')
    setEditingId(workAssignment.id)
    setEdit({
      project_id: workAssignment.project_id,
      employee_id: workAssignment.employee_id,
      start_date: workAssignment.start_date,
      end_date: workAssignment.end_date,
      description: workAssignment.description,
    })
  }

  async function saveEdit() {
    setEditError('')
    if (!edit.employee_id) return setEditError('Please select an employee.')
    if (!edit.project_id) return setEditError('Please select a project.')
    if (!edit.start_date) return setEditError('Start date is required.')
    if (!edit.end_date) return setEditError('End date is required.')
    if (edit.end_date < edit.start_date) return setEditError('End date cannot be before start date.')
    if (!edit.description.trim()) return setEditError('Task description is required.')

    try {
      const response = await fetch(`${API_URL}/api/work-assignments/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...edit, description: edit.description.trim() }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to update assignment')
      }
      const updated: WorkAssignment = await response.json()
      // If it was moved to another project it no longer belongs in this project's list
      setWorkAssignments((previous) =>
        previous
          .map((item) => (item.id === updated.id ? updated : item))
          .filter((item) => String(item.project_id) === String(projectId))
      )
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update assignment.')
    }
  }

  return (
    <>
      <h1>Assignments</h1>

      <div className="card">
        <h2>Select Project</h2>
        <div className="form-grid">
          <label className="form-field">
            Project
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {projectId && (
        <>
          <div className="card">
            <h2>Assigned Employees</h2>
            <p className="empty-state">
              This is project team membership — it does not by itself cover any specific date. An employee can only
              start a timer or add manual work for a date covered by a Work Assignment below.
            </p>
            <form onSubmit={handleAssignSubmit}>
              <div className="form-grid">
                <label className="form-field">
                  Assign Employee
                  <select
                    value={employeeToAssign}
                    onChange={(e) => setEmployeeToAssign(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select an employee
                    </option>
                    {allEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="submit" className="btn-primary">
                Assign
              </button>
              {assignmentsError && <p className="error-message">{assignmentsError}</p>}
            </form>

            {assignments.length === 0 ? (
              <p className="empty-state">No employees assigned yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Position</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>{assignment.employee_name}</td>
                      <td>{assignment.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Assign Work</h2>
            <form onSubmit={handleWorkAssignmentSubmit} noValidate>
              <div className="form-grid">
                <label className="form-field">
                  Assigned Employee
                  <select value={workEmployeeId} onChange={(e) => setWorkEmployeeId(e.target.value)}>
                    <option value="">Select an employee</option>
                    {assignments.map((assignment) => (
                      <option key={assignment.employee_id} value={assignment.employee_id}>
                        {assignment.employee_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Start Date
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label className="form-field">
                  End Date
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label className="form-field">
                  Task Description
                  <textarea
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="Explain what the employee should work on"
                  />
                </label>
              </div>
              <button type="submit" className="btn-primary">
                Assign Work
              </button>
              {workAssignmentsError && <p className="error-message">{workAssignmentsError}</p>}
            </form>
          </div>

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
        </>
      )}
    </>
  )
}

export default AssignWorkPage
