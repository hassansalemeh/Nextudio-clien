import { HttpError } from '../../shared'
import * as assignmentsRepository from './assignments.repository'

export async function listProjectAssignments(organizationId: string, projectId: string) {
  return assignmentsRepository.selectActiveProjectAssignments(organizationId, projectId)
}

export async function addProjectAssignment(organizationId: string, projectId: string, employeeId: string) {
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

export async function listWorkAssignments(organizationId: string, projectId: string | null, employeeId: string | null, date: string | null) {
  const conditions: string[] = []
  const params: string[] = []

  if (projectId) {
    params.push(projectId)
    conditions.push(`work_assignments.project_id = $${params.length + 1}`)
  }

  if (employeeId) {
    params.push(employeeId)
    conditions.push(`work_assignments.employee_id = $${params.length + 1}`)
  }

  if (date) {
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
  project_id: string,
  employee_id: string,
  start_date: string,
  end_date: string,
  description: string
) {
  const projectExists = await assignmentsRepository.selectProjectExists(organizationId, project_id)
  if (!projectExists) throw new HttpError(400, 'Project does not exist')

  const membership = await assignmentsRepository.selectActiveAssignmentWithEmployeeName(organizationId, project_id, employee_id)
  if (!membership) throw new HttpError(400, 'Employee is not actively assigned to this project')

  const assignment = await assignmentsRepository.insertWorkAssignment(project_id, employee_id, start_date, end_date, description)
  return { ...assignment, employee_name: membership.full_name }
}

export async function updateWorkAssignment(
  organizationId: string,
  assignmentId: string,
  project_id: string,
  employee_id: string,
  start_date: string,
  end_date: string,
  description: string
) {
  const projectExists = await assignmentsRepository.selectProjectExists(organizationId, project_id)
  if (!projectExists) throw new HttpError(400, 'Project does not exist')

  const membership = await assignmentsRepository.selectActiveAssignmentWithEmployeeName(organizationId, project_id, employee_id)
  if (!membership) throw new HttpError(400, 'Employee is not actively assigned to this project')

  // Only the assignment row changes; time entries the employee already recorded are never touched
  const updated = await assignmentsRepository.updateWorkAssignment(organizationId, assignmentId, project_id, employee_id, start_date, end_date, description)
  if (!updated) throw new HttpError(404, 'Assignment not found')

  return assignmentsRepository.selectWorkAssignmentById(organizationId, assignmentId)
}
