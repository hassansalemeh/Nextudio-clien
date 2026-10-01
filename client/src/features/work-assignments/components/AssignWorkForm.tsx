import Spinner from '../../../shared/components/Spinner'
import type { Assignment } from '../types'

type Props = {
  assignments: Assignment[]
  workEmployeeId: string
  setWorkEmployeeId: (value: string) => void
  startDate: string
  setStartDate: (value: string) => void
  endDate: string
  setEndDate: (value: string) => void
  taskDescription: string
  setTaskDescription: (value: string) => void
  workAssignmentsError: string
  submitting: boolean
  onSubmit: (event: React.FormEvent) => void
}

function AssignWorkForm({
  assignments,
  workEmployeeId,
  setWorkEmployeeId,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  taskDescription,
  setTaskDescription,
  workAssignmentsError,
  submitting,
  onSubmit,
}: Props) {
  return (
    <div className="card">
      <h2>Assign Work</h2>
      <form onSubmit={onSubmit} noValidate>
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
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting && <Spinner />} Assign Work
        </button>
        {workAssignmentsError && <p className="error-message">{workAssignmentsError}</p>}
      </form>
    </div>
  )
}

export default AssignWorkForm
