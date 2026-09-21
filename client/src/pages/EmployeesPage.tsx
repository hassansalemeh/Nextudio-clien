import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

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
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.full_name}</td>
                  <td>{employee.position}</td>
                  <td>{currencyFormatter.format(Number(employee.monthly_salary))}</td>
                  <td>
                    <span className={`status-badge ${employee.is_active ? 'status-active' : 'status-inactive'}`}>
                      {employee.is_active ? 'Active' : 'Inactive'}
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

export default EmployeesPage
