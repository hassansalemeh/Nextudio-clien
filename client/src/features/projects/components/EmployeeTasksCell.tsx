import { formatDateRange } from '../../../shared/lib/timeUtils'
import type { Assignment } from '../types'

type Props = {
  assignments: Assignment[]
  open: boolean
  onToggle: () => void
  panelId: string
}

function EmployeeTasksCell({ assignments, open, onToggle, panelId }: Props) {
  if (assignments.length === 0) {
    return <span className="stat-note">No tasks</span>
  }

  if (assignments.length === 1) {
    const [only] = assignments
    return (
      <div>
        <div>{formatDateRange(only.start_date, only.end_date)}</div>
        <div>{only.description}</div>
      </div>
    )
  }

  const latest = assignments.reduce((a, b) => (b.start_date > a.start_date ? b : a))
  const earliestStart = assignments.reduce((a, b) => (b.start_date < a ? b.start_date : a), assignments[0].start_date)
  const latestEnd = assignments.reduce((a, b) => (b.end_date > a ? b.end_date : a), assignments[0].end_date)

  return (
    <div className="tasks-summary">
      <div>{assignments.length} tasks</div>
      <div className="stat-note">{formatDateRange(earliestStart, latestEnd)}</div>
      <div className="cell-truncate" title={latest.description}>
        <strong>Latest:</strong> {latest.description}
      </div>
      <button type="button" className="btn-sm btn-ghost" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        {open ? 'Hide tasks' : 'Show tasks'}
      </button>
    </div>
  )
}

export default EmployeeTasksCell
