import { z } from 'zod'
import { idString, isoDate, optionalIdString, optionalIsoDate, text } from '../../shared'

export const projectIdParams = z.object({ projectId: idString('Project id') })
export const assignmentIdParams = z.object({ assignmentId: idString('Assignment id') })

export const addProjectAssignmentBody = z.object({ employee_id: idString('employee_id') })

// project_id, employee_id and date are all optional filters here (a caller may supply none, one, or several) -
// an Employee's own calls always have their employee_id filled in afterward regardless of what they send
// (see resolveEmployeeId), so "at least one of project_id/employee_id" is a business rule checked once that
// substitution has happened, in assignments.service, not a shape rule enforced here.
export const workAssignmentsListQuery = z.object({
  project_id: optionalIdString('project_id'),
  employee_id: optionalIdString('employee_id'),
  date: optionalIsoDate('date'),
})

// end_date cannot be before start_date - a cross-field rule, checked once both are known to be valid dates.
export const workAssignmentBody = z
  .object({
    project_id: idString('project_id'),
    employee_id: idString('employee_id'),
    start_date: isoDate('start_date'),
    end_date: isoDate('end_date'),
    description: text('description', { max: 2000 }),
  })
  .superRefine((data, ctx) => {
    if (data.end_date < data.start_date) {
      ctx.addIssue({ code: 'custom', message: 'end_date cannot be before start_date', path: ['end_date'] })
    }
  })
