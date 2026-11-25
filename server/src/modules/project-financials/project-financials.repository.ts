import type { Prisma } from '../../generated/prisma/client'
import { prisma } from '../../db'

export async function selectProjectsForFinancials(organizationId: string) {
  const rows = await prisma.projects.findMany({
    where: { organization_id: BigInt(organizationId) },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, fee_status: true, status: true, total_fee: true },
  })
  // pg returns bigint/numeric as strings (never native BigInt/Decimal, which res.json() can't
  // serialize); Prisma returns native BigInt/Decimal instead, so convert back to the same shape.
  return rows.map((row) => ({
    id: row.id.toString(),
    name: row.name,
    fee_status: row.fee_status,
    status: row.status,
    total_fee: row.total_fee === null ? null : row.total_fee.toString(),
  }))
}

// Real recorded time per (project, employee). Running entries count up to now; cost uses each entry's frozen rate.
// Pass a project id for one project, or nothing for all projects. time_entries has no organization_id of its own,
// so it is always reached through its project, which does.
// A 'pending' entry (unassigned project, awaiting admin approval) and a 'rejected' one never count here.
//
// Kept as raw SQL (via prisma.$queryRaw/$queryRawUnsafe, still through the same pool/adapter): the
// extract(epoch from ...) aggregate math and the optional project_id filter aren't expressible through
// Prisma's query builder, which has no equivalent of a raw interval/epoch expression inside sum().
export async function selectRecordedTimeByProjectEmployee(organizationId: string, projectId?: string) {
  const rows = await prisma.$queryRawUnsafe<{ project_id: bigint; employee_id: bigint; hours: Prisma.Decimal; cost: Prisma.Decimal }[]>(
    `SELECT time_entries.project_id, time_entries.employee_id,
            sum(extract(epoch FROM (coalesce(time_entries.ended_at, now()) - time_entries.started_at))) / 3600 AS hours,
            sum(extract(epoch FROM (coalesce(time_entries.ended_at, now()) - time_entries.started_at)) / 3600 * time_entries.hourly_rate_snapshot) AS cost
     FROM time_entries
     JOIN projects ON projects.id = time_entries.project_id
     WHERE time_entries.status = 'approved' AND projects.organization_id = $1 ${projectId ? 'AND time_entries.project_id = $2' : ''}
     GROUP BY time_entries.project_id, time_entries.employee_id`,
    ...(projectId ? [BigInt(organizationId), BigInt(projectId)] : [BigInt(organizationId)])
  )
  return rows.map((row) => ({
    project_id: row.project_id.toString(),
    employee_id: row.employee_id.toString(),
    hours: row.hours.toString(),
    cost: row.cost.toString(),
  }))
}
