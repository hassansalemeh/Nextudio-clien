import { formatDateRange } from '../../../shared/lib/timeUtils'
import type { Assignment } from '../types'

type Props = {
  assignments: Assignment[]
  colSpan: number
  panelId: string
}

function EmployeeTasksDetailRow({ assignments, colSpan, panelId }: Props) {
  const sorted = [...assignments].sort((a, b) => b.start_date.localeCompare(a.start_date))

  return (
    <tr className="task-detail-row">
      <td colSpan={colSpan} className="task-detail-cell" id={panelId}>
        <ul className="task-detail-list">
          {sorted.map((assignment, index) => (
            <li className="task-detail-item" key={index}>
              <span className="task-detail-date">{formatDateRange(assignment.start_date, assignment.end_date)}</span>
              <span className="task-detail-desc">{assignment.description}</span>
            </li>
          ))}
        </ul>
      </td>
    </tr>
  )
}

export default EmployeeTasksDetailRow
