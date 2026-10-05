import { useState } from 'react'
import EmployeeTasksCell from './EmployeeTasksCell'
import EmployeeTasksDetailRow from './EmployeeTasksDetailRow'
import type { ProjectDetails } from '../types'

type Props = {
  employee: ProjectDetails['employees'][number]
  formatHours: (hours: number) => string
  formatCurrency: (amount: number) => string
}

function EmployeeWorkRow({ employee, formatHours, formatCurrency }: Props) {
  const [open, setOpen] = useState(false)
  const showToggle = employee.assignments.length > 1
  const panelId = `tasks-${employee.employee_id}`

  return (
    <>
      <tr>
        <td data-label="Employee">{employee.full_name}</td>
        <td data-label="Position">{employee.position}</td>
        <td data-label="Tasks" className="col-wrap">
          <EmployeeTasksCell
            assignments={employee.assignments}
            open={open}
            onToggle={() => setOpen((current) => !current)}
            panelId={panelId}
          />
        </td>
        <td data-label="Hours Worked" className="num">{formatHours(employee.hours_worked)}</td>
        <td data-label="Hourly Cost" className="num">{formatCurrency(employee.hourly_cost)}</td>
        <td data-label="Labor Cost" className="num">{formatCurrency(employee.labor_cost)}</td>
      </tr>
      {showToggle && open && <EmployeeTasksDetailRow assignments={employee.assignments} colSpan={6} panelId={panelId} />}
    </>
  )
}

export default EmployeeWorkRow
