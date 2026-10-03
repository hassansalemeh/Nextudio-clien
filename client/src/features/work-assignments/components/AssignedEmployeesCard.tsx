import Spinner from '../../../shared/components/Spinner'
import EmptyState from '../../../shared/components/EmptyState'
import type { Assignment, Employee } from '../types'

type Props = {
  assignments: Assignment[]
  assignmentsError: string
  employeeToAssign: string
  setEmployeeToAssign: (value: string) => void
  allEmployees: Employee[]
  submitting: boolean
  onSubmit: (event: React.FormEvent) => void
}

function AssignedEmployeesCard({
  assignments,
  assignmentsError,
  employeeToAssign,
  setEmployeeToAssign,
  allEmployees,
  submitting,
  onSubmit,
}: Props) {
  return (
    <div className="card">
      <h2>Assigned Employees</h2>
      <p className="empty-state">
        This is project team membership — it does not by itself cover any specific date. An employee can only
        start a timer or add manual work for a date covered by a Work Assignment below.
      </p>
      <form onSubmit={onSubmit}>
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
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting && <Spinner />} Assign
        </button>
        {assignmentsError && <p className="error-message">{assignmentsError}</p>}
      </form>

      {assignments.length === 0 ? (
        <EmptyState message="No employees assigned yet." />
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
                <td data-label="Employee">{assignment.employee_name}</td>
                <td data-label="Position">{assignment.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default AssignedEmployeesCard
