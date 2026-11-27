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

// A member with no employee record (an owner/admin) is always a valid visitor; one with an employee
// record only while they're staff and active - a site worker or a deactivated employee is refused.
async function assertValidVisit(organizationId: string, memberId: string, projectId: string, visitDate: string) {
  if (visitDate > todayInCompanyTimezone()) throw new HttpError(400, 'Choose a date that is not in the future')

  const member = await siteVisitsRepository.selectMemberForVisit(organizationId, memberId)
  if (!member) throw new HttpError(400, 'Member does not exist')
  if (member.employeeKind === 'site_worker') throw new HttpError(400, 'Site workers are not tracked for site visits')
  if (member.employeeIsActive === false) throw new HttpError(400, 'This employee is not active')

  const project = await siteVisitsRepository.selectProjectForCompany(organizationId, projectId)
  if (!project) throw new HttpError(400, 'Project does not exist')
}

export async function listVisits(organizationId: string, month: string, memberId: string | null, projectId: string | null) {
  return siteVisitsRepository.selectVisits(organizationId, month, memberId, projectId)
}

export async function listVisitors(organizationId: string) {
  return siteVisitsRepository.selectVisitors(organizationId)
}

export async function createVisit(
  organizationId: string,
  memberId: string,
  projectId: string,
  visitDate: string,
  startTime: string,
  endTime: string | null,
  note: string | null,
  createdBy: string
) {
  await assertValidVisit(organizationId, memberId, projectId, visitDate)
  return siteVisitsRepository.insertVisit(organizationId, memberId, projectId, visitDate, startTime, endTime, note, createdBy)
}

export async function updateVisit(
  organizationId: string,
  id: string,
  requesterRole: Role,
  requesterMemberId: string | null,
  projectId: string,
  visitDate: string,
  startTime: string,
  endTime: string | null,
  note: string | null
) {
  const memberIdScope = requesterRole === Role.Employee ? requesterMemberId : null
  const existing = await siteVisitsRepository.selectVisitById(organizationId, id, memberIdScope)
  if (!existing) throw new HttpError(404, 'Visit not found')
  if (memberIdScope && daysSinceInCompanyTimezone(existing.visit_date) > EDIT_WINDOW_DAYS) {
    throw new HttpError(400, `This visit can no longer be edited - it is more than ${EDIT_WINDOW_DAYS} days old`)
  }

  await assertValidVisit(organizationId, existing.member_id, projectId, visitDate)
  const count = await siteVisitsRepository.updateVisitById(organizationId, id, memberIdScope, projectId, visitDate, startTime, endTime, note)
  if (count === 0) throw new HttpError(404, 'Visit not found')
}

export async function deleteVisit(organizationId: string, id: string, requesterRole: Role, requesterMemberId: string | null) {
  const memberIdScope = requesterRole === Role.Employee ? requesterMemberId : null
  const existing = await siteVisitsRepository.selectVisitById(organizationId, id, memberIdScope)
  if (!existing) throw new HttpError(404, 'Visit not found')
  if (memberIdScope && daysSinceInCompanyTimezone(existing.visit_date) > EDIT_WINDOW_DAYS) {
    throw new HttpError(400, `This visit can no longer be deleted - it is more than ${EDIT_WINDOW_DAYS} days old`)
  }

  const count = await siteVisitsRepository.deleteVisitById(organizationId, id, memberIdScope)
  if (count === 0) throw new HttpError(404, 'Visit not found')
}

type VisitForSummary = { member_id: string; visitor_name: string; project_id: string; project_name: string }

// Per member: how many visits this month, and to which projects. Per project: how many visits, and who
// went. memberIdScope (set only for an Employee caller) narrows the whole summary to their own visits.
export async function buildSummary(organizationId: string, month: string, memberIdScope: string | null) {
  const visits: VisitForSummary[] = await siteVisitsRepository.selectVisits(organizationId, month, memberIdScope, null)

  const byMember = new Map<string, { member_id: string; visitor_name: string; total_visits: number; projects: Map<string, { project_id: string; project_name: string; count: number }> }>()
  const byProject = new Map<string, { project_id: string; project_name: string; total_visits: number; visitors: Map<string, { member_id: string; visitor_name: string; count: number }> }>()

  for (const visit of visits) {
    if (!byMember.has(visit.member_id)) {
      byMember.set(visit.member_id, { member_id: visit.member_id, visitor_name: visit.visitor_name, total_visits: 0, projects: new Map() })
    }
    const memberSummary = byMember.get(visit.member_id)!
    memberSummary.total_visits += 1
    const memberProject = memberSummary.projects.get(visit.project_id)
    memberSummary.projects.set(visit.project_id, {
      project_id: visit.project_id,
      project_name: visit.project_name,
      count: (memberProject?.count ?? 0) + 1,
    })

    if (!byProject.has(visit.project_id)) {
      byProject.set(visit.project_id, { project_id: visit.project_id, project_name: visit.project_name, total_visits: 0, visitors: new Map() })
    }
    const projectSummary = byProject.get(visit.project_id)!
    projectSummary.total_visits += 1
    const projectVisitor = projectSummary.visitors.get(visit.member_id)
    projectSummary.visitors.set(visit.member_id, {
      member_id: visit.member_id,
      visitor_name: visit.visitor_name,
      count: (projectVisitor?.count ?? 0) + 1,
    })
  }

  return {
    by_member: [...byMember.values()]
      .map((member) => ({ ...member, projects: [...member.projects.values()] }))
      .sort((a, b) => a.visitor_name.localeCompare(b.visitor_name)),
    by_project: [...byProject.values()]
      .map((project) => ({ ...project, visitors: [...project.visitors.values()] }))
      .sort((a, b) => a.project_name.localeCompare(b.project_name)),
  }
}
