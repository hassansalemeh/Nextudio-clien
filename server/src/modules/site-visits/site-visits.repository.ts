import { prisma } from '../../db'

// Prisma represents a plain `date`/`time` SQL column (no timezone) as a Date anchored at the epoch date in
// UTC - these convert it back to the YYYY-MM-DD / HH:MM strings the API and the rest of the app expect.
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}
function toTimeString(date: Date): string {
  return date.toISOString().slice(11, 16)
}
// ...and these do the reverse, for writing a plain date/time value through Prisma.
function dateOnly(dateString: string): Date {
  return new Date(`${dateString}T00:00:00Z`)
}
function timeOnly(timeString: string): Date {
  return new Date(`1970-01-01T${timeString}:00Z`)
}

type MemberForName = {
  display_name: string | null
  employees: { full_name: string } | null
  app_users: { email: string }
}

// A visitor's name everywhere in site visits: their employee record's name if they have one (most staff
// do), else the display name an admin set for them (npm run set-name - typically an owner/admin, who has
// no employee record), else the part of their email before "@" so there's always SOMETHING to show.
function resolveMemberName(member: MemberForName): string {
  if (member.employees) return member.employees.full_name
  if (member.display_name) return member.display_name
  return member.app_users.email.split('@')[0]
}

type VisitRow = {
  id: bigint
  member_id: bigint
  project_id: bigint
  visit_date: Date
  start_time: Date
  end_time: Date | null
  note: string | null
  created_at: Date
  updated_at: Date
  organization_members: MemberForName
  projects: { name: string }
}

const MEMBER_NAME_INCLUDE = { select: { display_name: true, employees: { select: { full_name: true } }, app_users: { select: { email: true } } } }

function shapeVisit(row: VisitRow) {
  return {
    id: row.id.toString(),
    member_id: row.member_id.toString(),
    visitor_name: resolveMemberName(row.organization_members),
    project_id: row.project_id.toString(),
    project_name: row.projects.name,
    visit_date: toDateString(row.visit_date),
    start_time: toTimeString(row.start_time),
    end_time: row.end_time ? toTimeString(row.end_time) : null,
    note: row.note,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  }
}

// null employees means this member has no employee record at all (an owner/admin) - always a valid
// visitor. A member with an employee record is only a valid visitor while staff and active.
export async function selectMemberForVisit(organizationId: string, memberId: string) {
  const member = await prisma.organization_members.findFirst({
    where: { id: BigInt(memberId), organization_id: BigInt(organizationId) },
    select: { id: true, employees: { select: { kind: true, is_active: true } } },
  })
  return member ? { id: member.id.toString(), employeeKind: member.employees?.kind ?? null, employeeIsActive: member.employees?.is_active ?? null } : null
}

export async function selectProjectForCompany(organizationId: string, projectId: string) {
  const project = await prisma.projects.findFirst({
    where: { id: BigInt(projectId), organization_id: BigInt(organizationId) },
    select: { id: true },
  })
  return project ? { id: project.id.toString() } : null
}

// Every member who can validly be picked as a visitor: no employee record at all (an owner/admin), or a
// staff employee who is currently active - a site worker or a deactivated employee is left out entirely,
// since logging a visit for one would only fail validation anyway. Sorted by their resolved name.
export async function selectVisitors(organizationId: string) {
  const members = await prisma.organization_members.findMany({
    where: {
      organization_id: BigInt(organizationId),
      OR: [{ employees: null }, { employees: { kind: 'staff', is_active: true } }],
    },
    select: { id: true, role: true, display_name: true, employees: { select: { full_name: true } }, app_users: { select: { email: true } } },
  })
  return members
    .map((member) => ({ id: member.id.toString(), name: resolveMemberName(member), role: member.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// A whole month's visits, newest first - for one member, one project, both, or (admin, no filter) everyone.
export async function selectVisits(organizationId: string, month: string, memberId: string | null, projectId: string | null) {
  const from = dateOnly(`${month}-01`)
  const to = new Date(from)
  to.setUTCMonth(to.getUTCMonth() + 1)

  const rows = await prisma.site_visits.findMany({
    where: {
      organization_id: BigInt(organizationId),
      visit_date: { gte: from, lt: to },
      ...(memberId ? { member_id: BigInt(memberId) } : {}),
      ...(projectId ? { project_id: BigInt(projectId) } : {}),
    },
    include: { organization_members: MEMBER_NAME_INCLUDE, projects: { select: { name: true } } },
    orderBy: [{ visit_date: 'desc' }, { start_time: 'desc' }],
  })
  return rows.map(shapeVisit)
}

// memberIdScope narrows to one member's own visit when the caller is an Employee (never set for an Admin).
export async function selectVisitById(organizationId: string, id: string, memberIdScope: string | null) {
  const row = await prisma.site_visits.findFirst({
    where: {
      id: BigInt(id),
      organization_id: BigInt(organizationId),
      ...(memberIdScope ? { member_id: BigInt(memberIdScope) } : {}),
    },
    include: { organization_members: MEMBER_NAME_INCLUDE, projects: { select: { name: true } } },
  })
  return row ? shapeVisit(row) : null
}

export async function insertVisit(
  organizationId: string,
  memberId: string,
  projectId: string,
  visitDate: string,
  startTime: string,
  endTime: string | null,
  note: string | null,
  createdBy: string
) {
  const row = await prisma.site_visits.create({
    data: {
      organization_id: BigInt(organizationId),
      member_id: BigInt(memberId),
      project_id: BigInt(projectId),
      visit_date: dateOnly(visitDate),
      start_time: timeOnly(startTime),
      end_time: endTime ? timeOnly(endTime) : null,
      note,
      created_by: BigInt(createdBy),
    },
    include: { organization_members: MEMBER_NAME_INCLUDE, projects: { select: { name: true } } },
  })
  return shapeVisit(row)
}

// memberIdScope narrows the update to one member's own visit when the caller is an Employee, the same way
// selectVisitById does - defense in depth, so this never relies solely on an earlier read having checked it.
export async function updateVisitById(
  organizationId: string,
  id: string,
  memberIdScope: string | null,
  projectId: string,
  visitDate: string,
  startTime: string,
  endTime: string | null,
  note: string | null
) {
  const result = await prisma.site_visits.updateMany({
    where: {
      id: BigInt(id),
      organization_id: BigInt(organizationId),
      ...(memberIdScope ? { member_id: BigInt(memberIdScope) } : {}),
    },
    data: {
      project_id: BigInt(projectId),
      visit_date: dateOnly(visitDate),
      start_time: timeOnly(startTime),
      end_time: endTime ? timeOnly(endTime) : null,
      note,
      updated_at: new Date(),
    },
  })
  return result.count
}

export async function deleteVisitById(organizationId: string, id: string, memberIdScope: string | null) {
  const result = await prisma.site_visits.deleteMany({
    where: {
      id: BigInt(id),
      organization_id: BigInt(organizationId),
      ...(memberIdScope ? { member_id: BigInt(memberIdScope) } : {}),
    },
  })
  return result.count
}
