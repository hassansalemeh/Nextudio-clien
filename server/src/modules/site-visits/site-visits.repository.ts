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

type VisitRow = {
  id: bigint
  employee_id: bigint
  project_id: bigint
  visit_date: Date
  start_time: Date
  end_time: Date | null
  note: string | null
  created_at: Date
  updated_at: Date
  employees: { full_name: string }
  projects: { name: string }
}

function shapeVisit(row: VisitRow) {
  return {
    id: row.id.toString(),
    employee_id: row.employee_id.toString(),
    employee_name: row.employees.full_name,
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

export async function selectStaffEmployee(organizationId: string, employeeId: string) {
  const employee = await prisma.employees.findFirst({
    where: { id: BigInt(employeeId), organization_id: BigInt(organizationId) },
    select: { id: true, kind: true, is_active: true },
  })
  return employee ? { id: employee.id.toString(), kind: employee.kind, is_active: employee.is_active } : null
}

export async function selectProjectForCompany(organizationId: string, projectId: string) {
  const project = await prisma.projects.findFirst({
    where: { id: BigInt(projectId), organization_id: BigInt(organizationId) },
    select: { id: true },
  })
  return project ? { id: project.id.toString() } : null
}

// A whole month's visits, newest first - for one employee, one project, both, or (admin, no filter) everyone.
export async function selectVisits(organizationId: string, month: string, employeeId: string | null, projectId: string | null) {
  const from = dateOnly(`${month}-01`)
  const to = new Date(from)
  to.setUTCMonth(to.getUTCMonth() + 1)

  const rows = await prisma.site_visits.findMany({
    where: {
      organization_id: BigInt(organizationId),
      visit_date: { gte: from, lt: to },
      ...(employeeId ? { employee_id: BigInt(employeeId) } : {}),
      ...(projectId ? { project_id: BigInt(projectId) } : {}),
    },
    include: { employees: { select: { full_name: true } }, projects: { select: { name: true } } },
    orderBy: [{ visit_date: 'desc' }, { start_time: 'desc' }],
  })
  return rows.map(shapeVisit)
}

// employeeIdScope narrows to one employee's own visit when the caller is an Employee (never set for an Admin).
export async function selectVisitById(organizationId: string, id: string, employeeIdScope: string | null) {
  const row = await prisma.site_visits.findFirst({
    where: {
      id: BigInt(id),
      organization_id: BigInt(organizationId),
      ...(employeeIdScope ? { employee_id: BigInt(employeeIdScope) } : {}),
    },
    include: { employees: { select: { full_name: true } }, projects: { select: { name: true } } },
  })
  return row ? shapeVisit(row) : null
}

export async function insertVisit(
  organizationId: string,
  employeeId: string,
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
      employee_id: BigInt(employeeId),
      project_id: BigInt(projectId),
      visit_date: dateOnly(visitDate),
      start_time: timeOnly(startTime),
      end_time: endTime ? timeOnly(endTime) : null,
      note,
      created_by: BigInt(createdBy),
    },
    include: { employees: { select: { full_name: true } }, projects: { select: { name: true } } },
  })
  return shapeVisit(row)
}

// employeeIdScope narrows the update to one employee's own visit when the caller is an Employee, the same way
// selectVisitById does - defense in depth, so this never relies solely on an earlier read having checked it.
export async function updateVisitById(
  organizationId: string,
  id: string,
  employeeIdScope: string | null,
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
      ...(employeeIdScope ? { employee_id: BigInt(employeeIdScope) } : {}),
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

export async function deleteVisitById(organizationId: string, id: string, employeeIdScope: string | null) {
  const result = await prisma.site_visits.deleteMany({
    where: {
      id: BigInt(id),
      organization_id: BigInt(organizationId),
      ...(employeeIdScope ? { employee_id: BigInt(employeeIdScope) } : {}),
    },
  })
  return result.count
}
