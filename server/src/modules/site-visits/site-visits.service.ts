import { HttpError, Role, todayInCompanyTimezone } from '../../shared'
import * as siteVisitsRepository from './site-visits.repository'

const EDIT_WINDOW_DAYS = 7

// Whole calendar days between a past YYYY-MM-DD date and today, both in the company's own timezone -
// mirrors addDaysToDateString's UTC-anchored arithmetic in day-off-requests.service.ts.
function daysSinceInCompanyTimezone(dateString: string): number {
  const [y1, m1, d1] = dateString.split('-').map(Number)
  const [y2, m2, d2] = todayInCompanyTimezone().split('-').map(Number)
  const from = Date.UTC(y1, m1 - 1, d1)
  const to = Date.UTC(y2, m2 - 1, d2)
  return Math.round((to - from) / 86400000)
}

async function assertValidVisit(organizationId: string, employeeId: string, projectId: string, visitDate: string) {
  if (visitDate > todayInCompanyTimezone()) throw new HttpError(400, 'Choose a date that is not in the future')

  const employee = await siteVisitsRepository.selectStaffEmployee(organizationId, employeeId)
  if (!employee) throw new HttpError(400, 'Employee does not exist')
  if (!employee.is_active) throw new HttpError(400, 'This employee is not active')
  if (employee.kind === 'site_worker') throw new HttpError(400, 'Site workers are not tracked for site visits')

  const project = await siteVisitsRepository.selectProjectForCompany(organizationId, projectId)
  if (!project) throw new HttpError(400, 'Project does not exist')
}

export async function listVisits(organizationId: string, month: string, employeeId: string | null, projectId: string | null) {
  return siteVisitsRepository.selectVisits(organizationId, month, employeeId, projectId)
}

export async function createVisit(
  organizationId: string,
  employeeId: string,
  projectId: string,
  visitDate: string,
  startTime: string,
  endTime: string | null,
  note: string | null,
  createdBy: string
) {
  await assertValidVisit(organizationId, employeeId, projectId, visitDate)
  return siteVisitsRepository.insertVisit(organizationId, employeeId, projectId, visitDate, startTime, endTime, note, createdBy)
}

export async function updateVisit(
  organizationId: string,
  id: string,
  requesterRole: Role,
  requesterEmployeeId: string | null,
  projectId: string,
  visitDate: string,
  startTime: string,
  endTime: string | null,
  note: string | null
) {
  const employeeIdScope = requesterRole === Role.Employee ? requesterEmployeeId : null
  const existing = await siteVisitsRepository.selectVisitById(organizationId, id, employeeIdScope)
  if (!existing) throw new HttpError(404, 'Visit not found')
  if (employeeIdScope && daysSinceInCompanyTimezone(existing.visit_date) > EDIT_WINDOW_DAYS) {
    throw new HttpError(400, `This visit can no longer be edited - it is more than ${EDIT_WINDOW_DAYS} days old`)
  }

  await assertValidVisit(organizationId, existing.employee_id, projectId, visitDate)
  const count = await siteVisitsRepository.updateVisitById(organizationId, id, employeeIdScope, projectId, visitDate, startTime, endTime, note)
  if (count === 0) throw new HttpError(404, 'Visit not found')
}

export async function deleteVisit(organizationId: string, id: string, requesterRole: Role, requesterEmployeeId: string | null) {
  const employeeIdScope = requesterRole === Role.Employee ? requesterEmployeeId : null
  const existing = await siteVisitsRepository.selectVisitById(organizationId, id, employeeIdScope)
  if (!existing) throw new HttpError(404, 'Visit not found')
  if (employeeIdScope && daysSinceInCompanyTimezone(existing.visit_date) > EDIT_WINDOW_DAYS) {
    throw new HttpError(400, `This visit can no longer be deleted - it is more than ${EDIT_WINDOW_DAYS} days old`)
  }

  const count = await siteVisitsRepository.deleteVisitById(organizationId, id, employeeIdScope)
  if (count === 0) throw new HttpError(404, 'Visit not found')
}

type VisitForSummary = { employee_id: string; employee_name: string; project_id: string; project_name: string }

// Per employee: how many visits this month, and to which projects. Per project: how many visits, and who
// went. employeeIdScope (set only for an Employee caller) narrows the whole summary to their own visits.
export async function buildSummary(organizationId: string, month: string, employeeIdScope: string | null) {
  const visits: VisitForSummary[] = await siteVisitsRepository.selectVisits(organizationId, month, employeeIdScope, null)

  const byEmployee = new Map<string, { employee_id: string; employee_name: string; total_visits: number; projects: Map<string, { project_id: string; project_name: string; count: number }> }>()
  const byProject = new Map<string, { project_id: string; project_name: string; total_visits: number; visitors: Map<string, { employee_id: string; employee_name: string; count: number }> }>()

  for (const visit of visits) {
    if (!byEmployee.has(visit.employee_id)) {
      byEmployee.set(visit.employee_id, { employee_id: visit.employee_id, employee_name: visit.employee_name, total_visits: 0, projects: new Map() })
    }
    const employeeSummary = byEmployee.get(visit.employee_id)!
    employeeSummary.total_visits += 1
    const employeeProject = employeeSummary.projects.get(visit.project_id)
    employeeSummary.projects.set(visit.project_id, {
      project_id: visit.project_id,
      project_name: visit.project_name,
      count: (employeeProject?.count ?? 0) + 1,
    })

    if (!byProject.has(visit.project_id)) {
      byProject.set(visit.project_id, { project_id: visit.project_id, project_name: visit.project_name, total_visits: 0, visitors: new Map() })
    }
    const projectSummary = byProject.get(visit.project_id)!
    projectSummary.total_visits += 1
    const projectVisitor = projectSummary.visitors.get(visit.employee_id)
    projectSummary.visitors.set(visit.employee_id, {
      employee_id: visit.employee_id,
      employee_name: visit.employee_name,
      count: (projectVisitor?.count ?? 0) + 1,
    })
  }

  return {
    by_employee: [...byEmployee.values()]
      .map((employee) => ({ ...employee, projects: [...employee.projects.values()] }))
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name)),
    by_project: [...byProject.values()]
      .map((project) => ({ ...project, visitors: [...project.visitors.values()] }))
      .sort((a, b) => a.project_name.localeCompare(b.project_name)),
  }
}
