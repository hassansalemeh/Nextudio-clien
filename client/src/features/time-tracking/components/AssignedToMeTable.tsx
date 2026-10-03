import Spinner from '../../../shared/components/Spinner'
import EmptyState from '../../../shared/components/EmptyState'
import { localDateString } from '../../../shared/lib/timeUtils'
import type { Status, TodayAssignment } from '../types'

type Props = {
  assignments: TodayAssignment[]
  status: Status
  busy: boolean
  act: (path: string, body?: Record<string, string>) => void
}

function AssignedToMeTable({ assignments, status, busy, act }: Props) {
  const clockedIn = status.session !== null
  const active = status.active_entry

  return (
    <div className="card">
      <h2>Assigned to Me</h2>
      {assignments.length === 0 ? (
        <EmptyState message="Nothing is assigned to you today." />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Task</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => {
              const isActive = active !== null && String(active.project_id) === String(assignment.project_id)
              return (
                <tr key={assignment.id}>
                  <td data-label="Project">{assignment.project_name}</td>
                  <td data-label="Task" className="col-wrap">{assignment.description}</td>
                  <td data-label="Start Date">{assignment.start_date}</td>
                  <td data-label="End Date">{assignment.end_date}</td>
                  <td data-label="Actions">
                    {isActive ? (
                      <strong>Working</strong>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy || !clockedIn}
                        title={clockedIn ? undefined : 'Clock in first'}
                        onClick={() => act('start', { project_id: assignment.project_id, date: localDateString() })}
                      >
                        {busy && <Spinner />} Start Work
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {!clockedIn && assignments.length > 0 && <p className="empty-state">Clock in to start work.</p>}
    </div>
  )
}

export default AssignedToMeTable
