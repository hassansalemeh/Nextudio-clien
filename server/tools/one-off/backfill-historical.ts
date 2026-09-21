// One-off, re-runnable backfill of historical projects and time entries.
//   npx tsx tools/one-off/FILE.ts
// Safe to run again: clients, projects, assignments and entries are only created if they don't exist yet.
// Each entry is 09:00-17:00 (company local time) on every Monday-Friday in the range, using the
// employee's current salary / STANDARD_MONTHLY_HOURS as the frozen hourly rate.
import { hourlyRateFromSalary } from '../../src/config'
import { pool } from '../../src/db'

const TIMEZONE = 'Asia/Beirut'
const PLACEHOLDER_TASK = 'Task description to be confirmed'

type Work = { employee: string; from: string; to: string }
type ProjectSeed = {
  name: string
  client: string
  contact: string
  start_date: string
  fee_status: 'pending' | 'confirmed'
  total_fee: number | null
  work: Work[]
}

const PROJECTS: ProjectSeed[] = [
  {
    name: 'DNT',
    client: 'Design and Build Limited',
    contact: 'Mazen',
    start_date: '2026-09-10',
    fee_status: 'confirmed',
    total_fee: 7975,
    work: [{ employee: 'Ghida', from: '2026-09-10', to: '2026-09-21' }],
  },
  {
    name: 'SBM',
    client: 'JMP',
    contact: 'Mireille',
    start_date: '2026-08-28',
    fee_status: 'pending',
    total_fee: null,
    work: [
      { employee: 'Ghida', from: '2026-08-28', to: '2026-09-09' },
      { employee: 'Reem', from: '2026-08-28', to: '2026-09-15' },
    ],
  },
  {
    name: 'ATR',
    client: 'ATR Client - To Confirm', // temporary name: edit it once the company name is known
    contact: 'Bashir Sarieddine',
    start_date: '2026-09-14',
    fee_status: 'pending',
    total_fee: null,
    work: [{ employee: 'Fatima', from: '2026-09-14', to: '2026-09-21' }],
  },
]

// Every Monday-Friday between two YYYY-MM-DD dates, inclusive
function weekdays(from: string, to: string): string[] {
  const days: string[] = []
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay()
    if (dow >= 1 && dow <= 5) days.push(d.toISOString().slice(0, 10))
  }
  return days
}

async function main() {
  for (const seed of PROJECTS) {
    // Client
    let client = (await pool.query('SELECT id FROM clients WHERE lower(name) = lower($1)', [seed.client])).rows[0]
    if (!client) {
      client = (
        await pool.query('INSERT INTO clients (name, contact_name) VALUES ($1, $2) RETURNING id', [seed.client, seed.contact])
      ).rows[0]
      console.log(`created client "${seed.client}"`)
    }

    // Project
    let project = (await pool.query('SELECT id FROM projects WHERE lower(name) = lower($1)', [seed.name])).rows[0]
    if (!project) {
      project = (
        await pool.query(
          `INSERT INTO projects (client_id, name, total_fee, fee_status, start_date, status)
           VALUES ($1, $2, $3, $4, $5, 'in_progress') RETURNING id`,
          [client.id, seed.name, seed.total_fee, seed.fee_status, seed.start_date]
        )
      ).rows[0]
      console.log(`created project ${seed.name}`)
    }

    for (const work of seed.work) {
      const employee = (
        await pool.query('SELECT id, monthly_salary FROM employees WHERE lower(full_name) = lower($1)', [work.employee])
      ).rows[0]
      if (!employee) throw new Error(`Employee "${work.employee}" not found`)
      const rate = hourlyRateFromSalary(Number(employee.monthly_salary))

      // Assigned to the project, with a task covering the same dates
      await pool.query(
        `INSERT INTO project_assignments (project_id, employee_id) VALUES ($1, $2)
         ON CONFLICT (project_id, employee_id) DO UPDATE SET is_active = true`,
        [project.id, employee.id]
      )
      await pool.query(
        `INSERT INTO work_assignments (project_id, employee_id, start_date, end_date, description)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM work_assignments WHERE project_id = $1 AND employee_id = $2 AND start_date = $3 AND end_date = $4
         )`,
        [project.id, employee.id, work.from, work.to, PLACEHOLDER_TASK]
      )

      // Entries
      let created = 0
      let existing = 0
      const skipped: string[] = []
      for (const day of weekdays(work.from, work.to)) {
        const bounds = (
          await pool.query(
            `SELECT (($1::date + time '09:00') AT TIME ZONE $2) AS s, (($1::date + time '17:00') AT TIME ZONE $2) AS e`,
            [day, TIMEZONE]
          )
        ).rows[0]

        const same = await pool.query(
          'SELECT 1 FROM time_entries WHERE employee_id = $1 AND project_id = $2 AND started_at = $3',
          [employee.id, project.id, bounds.s]
        )
        if (same.rows.length > 0) {
          existing++
          continue
        }

        // Never overwrite or overlap time the employee already recorded
        const clash = await pool.query(
          `SELECT id FROM time_entries WHERE employee_id = $1 AND tstzrange(started_at, ended_at) && tstzrange($2, $3) LIMIT 1`,
          [employee.id, bounds.s, bounds.e]
        )
        if (clash.rows.length > 0) {
          skipped.push(`${day} (overlaps existing time entry #${clash.rows[0].id})`)
          continue
        }

        await pool.query(
          'INSERT INTO time_entries (employee_id, project_id, started_at, ended_at, hourly_rate_snapshot) VALUES ($1, $2, $3, $4, $5)',
          [employee.id, project.id, bounds.s, bounds.e, rate]
        )
        created++
      }

      console.log(
        `${seed.name} / ${work.employee}: ${created} created, ${existing} already existed` +
          (skipped.length ? `, SKIPPED ${skipped.length}: ${skipped.join('; ')}` : '')
      )
    }
  }
  await pool.end()
}

main().catch((err) => {
  console.log('Backfill failed:', err.message)
  process.exit(1)
})
