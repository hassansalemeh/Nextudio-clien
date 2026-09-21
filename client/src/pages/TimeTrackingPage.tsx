import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

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

type WorkEntry = {
  id: string
  employee_id: string
  employee_name: string
  work_date: string
  start_time: string
  end_time: string
  hourly_rate_snapshot: string
  hours_worked: number
  labor_cost: number
}

function TimeTrackingPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsError, setAssignmentsError] = useState('')
  const [employeeToAssign, setEmployeeToAssign] = useState('')

  const [allEmployees, setAllEmployees] = useState<Employee[]>([])

  const [workEntries, setWorkEntries] = useState<WorkEntry[]>([])
  const [workEntriesLoading, setWorkEntriesLoading] = useState(false)
  const [workEntriesError, setWorkEntriesError] = useState('')

  const [entryEmployeeId, setEntryEmployeeId] = useState('')
  const [workDate, setWorkDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

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
        setWorkEntriesError('Could not load projects.')
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
      setWorkEntries([])
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

    async function loadWorkEntries() {
      setWorkEntriesLoading(true)
      try {
        const response = await fetch(`${API_URL}/api/work-entries?project_id=${projectId}`)
        if (!response.ok) {
          throw new Error('Failed to load work entries')
        }
        const data = await response.json()
        setWorkEntries(data)
      } catch {
        setWorkEntriesError('Could not load work entries.')
      } finally {
        setWorkEntriesLoading(false)
      }
    }

    loadAssignments()
    loadWorkEntries()
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
        throw new Error('Failed to assign employee')
      }

      const newAssignment = await response.json()
      setAssignments((previous) => {
        const withoutExisting = previous.filter((a) => a.employee_id !== newAssignment.employee_id)
        return [...withoutExisting, newAssignment].sort((a, b) => a.employee_name.localeCompare(b.employee_name))
      })
      setEmployeeToAssign('')
    } catch {
      setAssignmentsError('Could not assign employee.')
    }
  }

  async function handleWorkEntrySubmit(event: React.FormEvent) {
    event.preventDefault()
    setWorkEntriesError('')

    try {
      const response = await fetch(`${API_URL}/api/work-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          employee_id: entryEmployeeId,
          work_date: workDate,
          start_time: startTime,
          end_time: endTime,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to create work entry')
      }

      const newEntry = await response.json()
      setWorkEntries((previous) => [newEntry, ...previous])

      setEntryEmployeeId('')
      setWorkDate('')
      setStartTime('')
      setEndTime('')
    } catch (err) {
      setWorkEntriesError(err instanceof Error ? err.message : 'Could not create work entry.')
    }
  }

  const totalHours = workEntries.reduce((sum, entry) => sum + entry.hours_worked, 0)
  const totalLaborCost = workEntries.reduce((sum, entry) => sum + entry.labor_cost, 0)

  return (
    <>
      <h1>Time Tracking</h1>

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
            <h2>Add Work Entry</h2>
            <form onSubmit={handleWorkEntrySubmit}>
              <div className="form-grid">
                <label className="form-field">
                  Assigned Employee
                  <select
                    value={entryEmployeeId}
                    onChange={(e) => setEntryEmployeeId(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select an employee
                    </option>
                    {assignments.map((assignment) => (
                      <option key={assignment.employee_id} value={assignment.employee_id}>
                        {assignment.employee_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Work Date
                  <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
                </label>
                <label className="form-field">
                  Start Time
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                </label>
                <label className="form-field">
                  End Time
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                </label>
              </div>
              <button type="submit" className="btn-primary">
                Add Work Entry
              </button>
              {workEntriesError && <p className="error-message">{workEntriesError}</p>}
            </form>
          </div>

          <div className="card">
            <h2>Work Entries</h2>
            {workEntriesLoading ? (
              <p className="empty-state">Loading work entries...</p>
            ) : workEntries.length === 0 ? (
              <p className="empty-state">No work entries yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Hours</th>
                    <th>Labor Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {workEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.work_date}</td>
                      <td>{entry.employee_name}</td>
                      <td>{entry.start_time}</td>
                      <td>{entry.end_time}</td>
                      <td>{entry.hours_worked.toFixed(2)}</td>
                      <td>{currencyFormatter.format(entry.labor_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>Project Totals</h2>
            <p>
              Total Project Hours: <strong>{totalHours.toFixed(2)}</strong>
            </p>
            <p>
              Total Project Labor Cost: <strong>{currencyFormatter.format(totalLaborCost)}</strong>
            </p>
          </div>
        </>
      )}
    </>
  )
}

export default TimeTrackingPage
