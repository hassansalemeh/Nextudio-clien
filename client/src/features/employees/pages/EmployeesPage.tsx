import { useEffect, useState } from 'react'
import PageHeader from '../../../shared/components/PageHeader'
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'
import PageLoader from '../../../shared/components/PageLoader'
import EmptyState from '../../../shared/components/EmptyState'
import { useToast } from '../../../shared/components/Toast'
import { useAsyncAction } from '../../../shared/hooks/useAsyncAction'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { createEmployee, fetchEmployees, updateEmployee } from '../api'
import type { Employee } from '../types'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function EmployeesPage() {
  const toast = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(true)
  const [employeesError, setEmployeesError] = useState('')

  const [fullName, setFullName] = useState('')
  const [position, setPosition] = useState('')
  const [monthlySalary, setMonthlySalary] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ full_name: '', position: '', monthly_salary: '', is_active: true })
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadEmployees() {
      try {
        const data = await fetchEmployees()
        setEmployees(data)
      } catch (err) {
        setEmployeesError(getErrorMessage(err, 'Could not load employees.'))
      } finally {
        setEmployeesLoading(false)
      }
    }

    loadEmployees()
  }, [])

  const [handleEmployeeSubmit, submitting] = useAsyncAction(async (event: React.FormEvent) => {
    event.preventDefault()
    setEmployeesError('')

    try {
      const newEmployee = await createEmployee({
        full_name: fullName,
        position,
        monthly_salary: Number(monthlySalary),
      })
      setEmployees((previousEmployees) => [newEmployee, ...previousEmployees])

      setFullName('')
      setPosition('')
      setMonthlySalary('')
      setFormOpen(false)
      toast.success('Employee added.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not create employee.')
      setEmployeesError(message)
      toast.error(message)
    }
  })

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

    setSaving(true)
    try {
      const updated = await updateEmployee(editingId!, { ...edit, monthly_salary: salary })
      setEmployees((previous) => previous.map((employee) => (employee.id === updated.id ? updated : employee)))
      setEditingId(null)
      toast.success('Employee updated.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not update employee.')
      setEditError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Employees"
        description="Keep your team's names, roles, and pay details in one place. Select a person to update their details."
        action={<button type="button" className="btn-primary header-action" aria-expanded={formOpen} aria-controls="employee-entry" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? <CloseIcon /> : <PlusIcon />} {formOpen ? 'Close form' : 'Add Employee'}
        </button>}
      />

      {formOpen && <div className="card entry-panel" id="employee-entry">
        <h2>Add Employee</h2>
        <form onSubmit={handleEmployeeSubmit}>
          <div className="form-grid">
            <label className="form-field">
              Full Name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
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
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting && <Spinner />} Add Employee
          </button>
          {employeesError && <p className="error-message">{employeesError}</p>}
        </form>
      </div>}

      <div className="card">
        <h2>Existing Employees</h2>
        {employeesError && !formOpen && <p className="error-message">{employeesError}</p>}
        {employeesLoading ? (
          <PageLoader label="Loading employees..." />
        ) : employees.length === 0 ? (
          <EmptyState message="No employees yet." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Position</th>
                <th className="num">Monthly Salary</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => [
                <tr key={employee.id} className="clickable-row" onClick={() => startEdit(employee)}>
                  <td data-label="Full Name"><button type="button" className="row-main-button" onClick={(event) => { event.stopPropagation(); startEdit(employee) }}>{employee.full_name}</button></td>
                  <td data-label="Position">{employee.position}</td>
                  <td data-label="Monthly Salary" className="num">{currencyFormatter.format(Number(employee.monthly_salary))}</td>
                  <td data-label="Status">
                    <span className={`status-badge ${employee.is_active ? 'status-active' : 'status-inactive'}`}>
                      {employee.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <button type="button" className="btn-sm btn-ghost" onClick={(event) => { event.stopPropagation(); startEdit(employee) }}>
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
    </>
  )
}

export default EmployeesPage
