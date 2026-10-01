import { pool } from '../../db'

export async function selectProjectsForFinancials() {
  const result = await pool.query('SELECT id, name, fee_status, status, total_fee FROM projects ORDER BY name')
  return result.rows
}

// Real recorded time per (project, employee). Running entries count up to now; cost uses each entry's frozen rate.
// Pass a project id for one project, or nothing for all projects.
// A 'pending' entry (unassigned project, awaiting admin approval) and a 'rejected' one never count here.
export async function selectRecordedTimeByProjectEmployee(projectId?: string) {
  const result = await pool.query(
    `SELECT project_id, employee_id,
            sum(extract(epoch FROM (coalesce(ended_at, now()) - started_at))) / 3600 AS hours,
            sum(extract(epoch FROM (coalesce(ended_at, now()) - started_at)) / 3600 * hourly_rate_snapshot) AS cost
     FROM time_entries
     WHERE status = 'approved' ${projectId ? 'AND project_id = $1' : ''}
     GROUP BY project_id, employee_id`,
    projectId ? [projectId] : []
  )
  return result.rows as { project_id: string; employee_id: string; hours: string; cost: string }[]
}
