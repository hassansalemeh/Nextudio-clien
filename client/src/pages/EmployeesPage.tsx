import { useEffect, useState } from 'react'
import { CheckIcon, CloseIcon, PencilIcon } from '../components/icons'

const API_URL = import.meta.env.VITE_API_URL ?? ''

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

type Employee = {
  id: string
  full_name: string
  position: string
  monthly_salary: string
  is_active: boolean
  created_at: string
}

function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(true)
  const [employeesError, setEmployeesError] = useState('')

  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [monthlySalary, setMonthlySalary] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ full_name: '', position: '', monthly_salary: '', is_active: true })
  const [editError, setEditError] = useState('')

  useEffect(() => {
    async function loadEmployees() {
      try {
        const response = await fetch(`${API_URL}/api/employees`)
        if (!response.ok) {
          throw new Error('Failed to load employees')
        }
        const data = await response.json()
        setEmployees(data)
      } catch {
        setEmployeesError('Could not load employees.')
      } finally {
        setEmployeesLoading(false)
      }
    }

    loadEmployees()
  }, [])

  async function handleEmployeeSubmit(event: React.FormEvent) {
    event.preventDefault()
    setEmployeesError('')

    try {
      const response = await fetch(`${API_URL}/api/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          position,
          monthly_salary: Number(monthlySalary),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create employee')
      }

      const newEmployee = await response.json()
      setEmployees((previousEmployees) => [newEmployee, ...previousEmployees])

      setFullName('')
      setPosition('')
      setMonthlySalary('')
    } catch {
      setEmployeesError('Could not create employee.')
    }
  }

  function startEdit(employee: Employee) {
    setEditError('')
    setEditingId(employee.id)
    setEdit({
      full_name: employee.full_name,
      position: employee.position,
      monthly_salary: String(employee.monthly_salary),
      is_active: employee.is_active,
    })
  }

  async function saveEdit() {
    setEditError('')
    if (!edit.full_name.trim()) return setEditError('Full name is required.')
    if (!edit.position.trim()) return setEditError('Position is required.')
    const salary = Number(edit.monthly_salary)
    if (edit.monthly_salary === '' || Number.isNaN(salary) || salary < 0) {
      return setEditError('Monthly salary must be a non-negative number.')
    }

    try {
      const response = await fetch(`${API_URL}/api/employees/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...edit, monthly_salary: salary }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to update employee')
      }
      const updated = await response.json()
      setEmployees((previous) => previous.map((employee) => (employee.id === updated.id ? updated : employee)))
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update employee.')
    }
  }

  return (
    <>
      <h1>Employees</h1>

      <div className="card">
        <h2>Add Employee</h2>
        <form onSubmit={handleEmployeeSubmit}>
          <div className="form-grid">
            <label className="form-field">
              Full Name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label className="form-field">
              Position
              <input value={position} onChange={(e) => setPosition(e.target.value)} required />
            </label>
            <label className="form-field">
              Monthly Salary
              <input
                type="number"
                min="0"
                step="0.01"
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(e.target.value)}
                required
              />
            </label>
          </div>
          <button type="submit" className="btn-primary">
            Add Employee
          </button>
          {employeesError && <p className="error-message">{employeesError}</p>}
        </form>
      </div>

      <div className="card">
        <h2>Existing Employees</h2>
        {employeesLoading ? (
          <p className="empty-state">Loading employees...</p>
        ) : employees.length === 0 ? (
          <p className="empty-state">No employees yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Position</th>
                <th>Monthly Salary</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => [
                <tr key={employee.id}>
                  <td>{employee.full_name}</td>
                  <td>{employee.position}</td>
                  <td>{currencyFormatter.format(Number(employee.monthly_salary))}</td>
                  <td>
                    <span className={`status-badge ${employee.is_active ? 'status-active' : 'status-inactive'}`}>
                      {employee.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="btn-sm btn-ghost" onClick={() => startEdit(employee)}>
<PencilIcon /> Edit
</button>
                  </td>
                </tr>,
                editingId === employee.id && (
                  <tr key={`${employee.id}-edit`}>
                    <td colSpan={5}>
                      <div className="form-grid">
                        <label className="form-field">
                          Full Name
                          <input value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Position
                          <input value={edit.position} onChange={(e) => setEdit({ ...edit, position: e.target.value })} />
                        </label>
                        <label className="form-field">
                          Monthly Salary
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={edit.monthly_salary}
                            onChange={(e) => setEdit({ ...edit, monthly_salary: e.target.value })}
                          />
                        </label>
                        <label className="form-field">
                          Status
                          <select
                            value={edit.is_active ? 'active' : 'inactive'}
                            onChange={(e) => setEdit({ ...edit, is_active: e.target.value === 'active' })}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </label>
                      </div>
                      <p className="empty-state">A new salary applies to future work only. Past project costs are not changed.</p>
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

export default EmployeesPage
