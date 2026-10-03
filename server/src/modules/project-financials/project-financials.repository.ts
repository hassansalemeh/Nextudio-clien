import { pool } from '../../db'

export async function selectProjectsForFinancials(organizationId: string) {
  const result = await pool.query('SELECT id, name, fee_status, status, total_fee FROM projects WHERE organization_id = $1 ORDER BY name', [
    organizationId,
  ])
  return result.rows
}

// Real recorded time per (project, employee). Running entries count up to now; cost uses each entry's frozen rate.
// Pass a project id for one project, or nothing for all projects. time_entries has no organization_id of its own,
// so it is always reached through its project, which does.
// A 'pending' entry (unassigned project, awaiting admin approval) and a 'rejected' one never count here.
export async function selectRecordedTimeByProjectEmployee(organizationId: string, projectId?: string) {
  const result = await pool.query(
    `SELECT time_entries.project_id, time_entries.employee_id,
            sum(extract(epoch FROM (coalesce(time_entries.ended_at, now()) - time_entries.started_at))) / 3600 AS hours,
            sum(extract(epoch FROM (coalesce(time_entries.ended_at, now()) - time_entries.started_at)) / 3600 * time_entries.hourly_rate_snapshot) AS cost
     FROM time_entries
     JOIN projects ON projects.id = time_entries.project_id
     WHERE time_entries.status = 'approved' AND projects.organization_id = $1 ${projectId ? 'AND time_entries.project_id = $2' : ''}
     GROUP BY time_entries.project_id, time_entries.employee_id`,
    projectId ? [organizationId, projectId] : [organizationId]
  )
  return result.rows as { project_id: string; employee_id: string; hours: string; cost: string }[]
}
