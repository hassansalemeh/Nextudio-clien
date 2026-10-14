import { pool } from '../../db'

export type OrganizationRow = { id: string; name: string }

export async function selectOrganizations(): Promise<OrganizationRow[]> {
  const result = await pool.query('SELECT id, name FROM organizations ORDER BY id')
  return result.rows
}

export type ReminderSignal = {
  id: string
  full_name: string
  contact_email: string | null
  is_active: boolean
  has_entry_today: boolean
  has_approved_day_off: boolean
}

// Every employee in this organization, with the three signals needed to decide "remind or skip, and why" -
// the classification itself (and the run log) happens in the service, not here, so every skip reason
// (already submitted, day off, inactive, missing email) can be reported, not just the ones left after a
// SQL filter. "Logged today" counts any time entry regardless of status - even a rejected one still means
// they logged something.
export async function selectEmployeesForReminderCheck(organizationId: string, dateString: string): Promise<ReminderSignal[]> {
  const result = await pool.query(
    // Beirut, matching shared/companyTime.ts's COMPANY_TIMEZONE - Postgres's AT TIME ZONE with an IANA zone
    // name handles the DST conversion correctly, so there's no need to compute UTC day bounds in JS.
    `SELECT employees.id, employees.full_name, employees.contact_email, employees.is_active,
            EXISTS (
              SELECT 1 FROM time_entries
              WHERE time_entries.employee_id = employees.id
                AND (time_entries.started_at AT TIME ZONE 'Asia/Beirut')::date = $2::date
            ) AS has_entry_today,
            EXISTS (
              SELECT 1 FROM day_off_requests
              WHERE day_off_requests.employee_id = employees.id
                AND day_off_requests.request_date = $2::date
                AND day_off_requests.status = 'approved'
            ) AS has_approved_day_off
     FROM employees
     WHERE employees.organization_id = $1
     ORDER BY employees.full_name`,
    [organizationId, dateString]
  )
  return result.rows
}

// Claims today for this organization by inserting a row - the unique (organization_id, run_date) index means
// only one caller ever wins this insert, however many server instances tick at the same moment. Returns
// whether THIS call won the claim (true) or someone else already had it (false).
export async function claimReminderRun(organizationId: string, dateString: string, outcome: 'sent' | 'missed_window'): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO reminder_runs (organization_id, run_date, outcome)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, run_date) DO NOTHING
     RETURNING id`,
    [organizationId, dateString, outcome]
  )
  return (result.rowCount ?? 0) > 0
}

export async function completeReminderRun(
  organizationId: string,
  dateString: string,
  remindedCount: number,
  skippedCount: number
): Promise<void> {
  await pool.query(
    `UPDATE reminder_runs SET completed_at = now(), reminded_count = $3, skipped_count = $4
     WHERE organization_id = $1 AND run_date = $2`,
    [organizationId, dateString, remindedCount, skippedCount]
  )
}
