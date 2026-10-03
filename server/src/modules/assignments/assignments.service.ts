import { HttpError, isIsoDate } from '../../shared'
import * as assignmentsRepository from './assignments.repository'

export async function listProjectAssignments(organizationId: string, projectId: string) {
  return assignmentsRepository.selectActiveProjectAssignments(organizationId, projectId)
}

export async function addProjectAssignment(organizationId: string, projectId: string, employeeId: unknown) {
  if (!employeeId) throw new HttpError(400, 'employee_id is required')

  const projectExists = await assignmentsRepository.selectProjectExists(organizationId, projectId)
  if (!projectExists) throw new HttpError(400, 'Project does not exist')

  const employeeExists = await assignmentsRepository.selectEmployeeExists(organizationId, employeeId)
  if (!employeeExists) throw new HttpError(400, 'Employee does not exist')

  const existing = await assignmentsRepository.selectProjectAssignment(projectId, employeeId)

  let assignmentId
  if (existing) {
    if (existing.is_active) {
      throw new HttpError(400, 'Employee is already assigned to this project')
    }
    assignmentId = await assignmentsRepository.reactivateProjectAssignment(existing.id)
  } else {
    assignmentId = await assignmentsRepository.insertProjectAssignment(projectId, employeeId)
  }

  return assignmentsRepository.selectProjectAssignmentById(assignmentId)
}

export async function listWorkAssignments(organizationId: string, projectId: unknown, employeeId: unknown, date: unknown) {
  const conditions: string[] = []
  const params: string[] = []

  if (typeof projectId === 'string' && projectId) {
    params.push(projectId)
    conditions.push(`work_assignments.project_id = $${params.length + 1}`)
  }

  if (typeof employeeId === 'string' && employeeId) {
    params.push(employeeId)
    conditions.push(`work_assignments.employee_id = $${params.length + 1}`)
  }

  if (typeof date === 'string' && date) {
    params.push(date)
    conditions.push(`work_assignments.start_date <= $${params.length + 1} AND work_assignments.end_date >= $${params.length + 1}`)
  }

  if (!projectId && !employeeId) {
    throw new HttpError(400, 'project_id or employee_id is required')
  }

  return assignmentsRepository.selectWorkAssignments(organizationId, conditions, params)
}

export async function createWorkAssignment(
  organizationId: string,
  project_id: unknown,
  employee_id: unknown,
  start_date: string,
  end_date: string,
  description: string
) {
  if (!project_id) throw new HttpError(400, 'project_id is required')
  if (!employee_id) throw new HttpError(400, 'employee_id is required')
  if (!start_date) throw new HttpError(400, 'start_date is required')
  if (!end_date) throw new HttpError(400, 'end_date is required')
  // ISO YYYY-MM-DD strings compare correctly as text
  if (end_date < start_date) throw new HttpError(400, 'end_date cannot be before start_date')
  if (!description) throw new HttpError(400, 'description is required')

  const projectExists = await assignmentsRepository.selectProjectExists(organizationId, String(project_id))
  if (!projectExists) throw new HttpError(400, 'Project does not exist')

  const membership = await assignmentsRepository.selectActiveAssignmentWithEmployeeName(organizationId, project_id, employee_id)
  if (!membership) throw new HttpError(400, 'Employee is not actively assigned to this project')

  const assignment = await assignmentsRepository.insertWorkAssignment(project_id, employee_id, start_date, end_date, description)
  return { ...assignment, employee_name: membership.full_name }
}

export async function updateWorkAssignment(
  organizationId: string,
  assignmentId: string,
  project_id: unknown,
  employee_id: unknown,
  start_date: string,
  end_date: string,
  description: string
) {
  if (!project_id) throw new HttpError(400, 'project_id is required')
  if (!employee_id) throw new HttpError(400, 'employee_id is required')
  if (!isIsoDate(start_date)) throw new HttpError(400, 'start_date is required')
  if (!isIsoDate(end_date)) throw new HttpError(400, 'end_date is required')
  if (end_date < start_date) throw new HttpError(400, 'end_date cannot be before start_date')
  if (!description) throw new HttpError(400, 'description is required')

  const projectExists = await assignmentsRepository.selectProjectExists(organizationId, String(project_id))
  if (!projectExists) throw new HttpError(400, 'Project does not exist')

  const membership = await assignmentsRepository.selectActiveAssignmentWithEmployeeName(organizationId, project_id, employee_id)
  if (!membership) throw new HttpError(400, 'Employee is not actively assigned to this project')

  // Only the assignment row changes; time entries the employee already recorded are never touched
  const updated = await assignmentsRepository.updateWorkAssignment(organizationId, assignmentId, project_id, employee_id, start_date, end_date, description)
  if (!updated) throw new HttpError(404, 'Assignment not found')

  return assignmentsRepository.selectWorkAssignmentById(organizationId, assignmentId)
}
