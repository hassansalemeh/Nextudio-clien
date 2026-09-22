import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path from 'path'
import type { PoolClient } from 'pg'
import { registerAuth, resolveEmployeeId } from './auth'
import { hourlyRateFromSalary } from './config'
import { pool } from './db'
import { HttpError, describeError, isIsoDate, roundMoney, withTransaction } from './http'
import { registerDocumentRoutes } from './documents'
import { registerEstimateEmailRoutes } from './estimateEmail'
import { registerEstimateRoutes } from './estimates'
import { listInvoices, registerInvoiceRoutes } from './invoices'
import { registerPaymentRoutes } from './payments'
import { isProduction, registerSecurity } from './security'

const app = express()
// The host (GoDaddy / Passenger) supplies the port in PORT; 4000 is only the local development default
const port = process.env.PORT ?? 4000

// Errors must be easy to diagnose after launch: everything goes to stdout / stderr, which the host keeps as its logs
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err)
  process.exit(1) // the host restarts the app
})

registerSecurity(app)

// In production the website and the API share one address, so no CORS is needed. It is only switched on when
// CORS_ORIGIN is set (for example a separately hosted front end during development).
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true, exposedHeaders: ['Content-Disposition'] }))
}
app.use(express.json({ limit: '5mb' })) // quotations can carry very long descriptions and terms

// One log line per API request (method, path without query string, status, time); server errors are marked
app.use('/api', (req, res, next) => {
  const started = Date.now()
  res.on('finish', () => {
    const line = `${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${Date.now() - started}ms`
    if (res.statusCode >= 500) console.error(`[error] ${line}`)
    else if (!req.originalUrl.startsWith('/api/health')) console.log(line)
  })
  next()
})

// Health check: also proves the database can be reached. It only ever answers with these two words, never details.
app.get('/api/health', async (_req, res) => {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('database did not answer within 5 seconds')), 5000)),
    ])
    res.json({ status: 'ok', database: 'ok' })
  } catch (err) {
    console.error('[health] database check failed:', describeError(err))
    res.status(503).json({ status: 'error', database: 'failed' })
  }
})

// Login routes, then authentication + role checks for every other /api route
registerAuth(app)
registerEstimateRoutes(app)
registerEstimateEmailRoutes(app)
registerInvoiceRoutes(app)
registerPaymentRoutes(app)
registerDocumentRoutes(app)

app.get('/api/clients', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, contact_name, email, phone, created_at FROM clients ORDER BY created_at DESC'
    )
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'Failed to fetch clients' })
  }
})

app.post('/api/clients', async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const contact_name = typeof req.body.contact_name === 'string' ? req.body.contact_name.trim() : null
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : null
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : null

  if (!name) {
    return res.status(400).json({ error: 'Client name is required' })
  }

  try {
    const result = await pool.query(
      'INSERT INTO clients (name, contact_name, email, phone) VALUES ($1, $2, $3, $4) RETURNING id, name, contact_name, email, phone, created_at',
      [name, contact_name, email, phone]
    )
    res.status(201).json(result.rows[0])
  } catch {
    res.status(500).json({ error: 'Failed to create client' })
  }
})

app.get('/api/employees', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, position, monthly_salary, is_active, created_at FROM employees ORDER BY created_at DESC'
    )
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'Failed to fetch employees' })
  }
})

app.post('/api/employees', async (req, res) => {
  const full_name = typeof req.body.full_name === 'string' ? req.body.full_name.trim() : ''
  const position = typeof req.body.position === 'string' ? req.body.position.trim() : ''
  const monthly_salary = req.body.monthly_salary

  if (!full_name) {
    return res.status(400).json({ error: 'full_name is required' })
  }

  if (!position) {
    return res.status(400).json({ error: 'position is required' })
  }

  if (typeof monthly_salary !== 'number' || Number.isNaN(monthly_salary) || monthly_salary < 0) {
    return res.status(400).json({ error: 'monthly_salary must be a non-negative number' })
  }

  try {
    const result = await pool.query(
      'INSERT INTO employees (full_name, position, monthly_salary) VALUES ($1, $2, $3) RETURNING id, full_name, position, monthly_salary, is_active, created_at',
      [full_name, position, monthly_salary]
    )
    res.status(201).json(result.rows[0])
  } catch {
    res.status(500).json({ error: 'Failed to create employee' })
  }
})

const PROJECT_STATUSES = ['planning', 'in_progress', 'completed', 'on_hold']
const FEE_STATUSES = ['pending', 'confirmed']

// Pending projects may have no fee yet; confirmed projects must have one
function parseFee(body: { fee_status?: unknown; total_fee?: unknown }): { fee_status: string; total_fee: number | null } {
  const fee_status = body.fee_status ?? 'pending'
  if (typeof fee_status !== 'string' || !FEE_STATUSES.includes(fee_status)) {
    throw new HttpError(400, 'fee_status must be pending or confirmed')
  }
  const raw = body.total_fee
  const hasFee = raw !== null && raw !== undefined && raw !== ''
  if (hasFee && (typeof raw !== 'number' || Number.isNaN(raw) || raw < 0)) {
    throw new HttpError(400, 'total_fee must be a non-negative number')
  }
  if (fee_status === 'confirmed' && !hasFee) {
    throw new HttpError(400, 'total_fee is required when the fee is confirmed')
  }
  return { fee_status, total_fee: hasFee ? (raw as number) : null }
}

app.get('/api/projects', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT projects.id, projects.client_id, clients.name AS client_name, projects.name,
              projects.description, projects.total_fee, projects.fee_status, projects.source_estimate_id,
              to_char(projects.start_date, 'YYYY-MM-DD') AS start_date, projects.status,
              projects.created_at
       FROM projects
       JOIN clients ON clients.id = projects.client_id
       ORDER BY projects.created_at DESC`
    )
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

// Employee-safe project list for "Add Work Manually": names only, no client, fee or financial data,
// and only projects that are actually open for new work.
app.get('/api/projects/active-names', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM projects WHERE status IN ('planning', 'in_progress') ORDER BY name`
    )
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

app.post('/api/projects', async (req, res) => {
  const client_id = req.body.client_id
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null
  const start_date = typeof req.body.start_date === 'string' && req.body.start_date ? req.body.start_date : null
  const status = req.body.status
  let fee
  try {
    fee = parseFee(req.body)
  } catch (err) {
    return sendTimeError(res, err, 'Invalid fee')
  }

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' })
  }

  if (!name) {
    return res.status(400).json({ error: 'name is required' })
  }

  if (!PROJECT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status must be one of: ' + PROJECT_STATUSES.join(', ') })
  }

  try {
    const result = await pool.query(
      `INSERT INTO projects (client_id, name, description, total_fee, fee_status, start_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, client_id, name, description, total_fee, fee_status,
                 to_char(start_date, 'YYYY-MM-DD') AS start_date, status, created_at`,
      [client_id, name, description, fee.total_fee, fee.fee_status, start_date, status]
    )

    const project = result.rows[0]
    const clientResult = await pool.query('SELECT name FROM clients WHERE id = $1', [client_id])

    res.status(201).json({ ...project, client_name: clientResult.rows[0]?.name ?? null })
  } catch {
    res.status(500).json({ error: 'Failed to create project' })
  }
})

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function computeHours(startTime: string, endTime: string): number {
  return (timeToMinutes(endTime) - timeToMinutes(startTime)) / 60
}

app.get('/api/projects/:projectId/assignments', async (req, res) => {
  const { projectId } = req.params

  try {
    const result = await pool.query(
      `SELECT project_assignments.id, project_assignments.employee_id,
              employees.full_name AS employee_name, employees.position
       FROM project_assignments
       JOIN employees ON employees.id = project_assignments.employee_id
       WHERE project_assignments.project_id = $1 AND project_assignments.is_active = true
       ORDER BY employees.full_name`,
      [projectId]
    )
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'Failed to fetch assignments' })
  }
})

app.post('/api/projects/:projectId/assignments', async (req, res) => {
  const { projectId } = req.params
  const employee_id = req.body.employee_id

  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required' })
  }

  try {
    const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId])
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project does not exist' })
    }

    const employeeResult = await pool.query('SELECT id FROM employees WHERE id = $1', [employee_id])
    if (employeeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Employee does not exist' })
    }

    const existing = await pool.query(
      'SELECT id, is_active FROM project_assignments WHERE project_id = $1 AND employee_id = $2',
      [projectId, employee_id]
    )

    let assignmentId
    if (existing.rows.length > 0) {
      if (existing.rows[0].is_active) {
        return res.status(400).json({ error: 'Employee is already assigned to this project' })
      }
      const reactivated = await pool.query(
        'UPDATE project_assignments SET is_active = true, assigned_at = now() WHERE id = $1 RETURNING id',
        [existing.rows[0].id]
      )
      assignmentId = reactivated.rows[0].id
    } else {
      const inserted = await pool.query(
        'INSERT INTO project_assignments (project_id, employee_id) VALUES ($1, $2) RETURNING id',
        [projectId, employee_id]
      )
      assignmentId = inserted.rows[0].id
    }

    const result = await pool.query(
      `SELECT project_assignments.id, project_assignments.employee_id,
              employees.full_name AS employee_name, employees.position
       FROM project_assignments
       JOIN employees ON employees.id = project_assignments.employee_id
       WHERE project_assignments.id = $1`,
      [assignmentId]
    )

    res.status(201).json(result.rows[0])
  } catch {
    res.status(500).json({ error: 'Failed to assign employee' })
  }
})

app.get('/api/work-entries', async (req, res) => {
  const projectId = req.query.project_id

  if (!projectId) {
    return res.status(400).json({ error: 'project_id is required' })
  }

  try {
    const result = await pool.query(
      `SELECT work_entries.id, work_entries.employee_id, employees.full_name AS employee_name,
              to_char(work_entries.work_date, 'YYYY-MM-DD') AS work_date,
              to_char(work_entries.start_time, 'HH24:MI') AS start_time,
              to_char(work_entries.end_time, 'HH24:MI') AS end_time,
              work_entries.hourly_rate_snapshot, work_entries.created_at
       FROM work_entries
       JOIN employees ON employees.id = work_entries.employee_id
       WHERE work_entries.project_id = $1
       ORDER BY work_entries.work_date DESC, work_entries.start_time DESC`,
      [projectId]
    )

    const entries = result.rows.map((row) => {
      const hours = computeHours(row.start_time, row.end_time)
      const hourlyRate = Number(row.hourly_rate_snapshot)
      return {
        ...row,
        hours_worked: hours,
        labor_cost: Math.round(hours * hourlyRate * 100) / 100,
      }
    })

    res.json(entries)
  } catch {
    res.status(500).json({ error: 'Failed to fetch work entries' })
  }
})

app.post('/api/work-entries', async (req, res) => {
  const project_id = req.body.project_id
  const employee_id = req.body.employee_id
  const work_date = typeof req.body.work_date === 'string' ? req.body.work_date.trim() : ''
  const start_time = typeof req.body.start_time === 'string' ? req.body.start_time.trim() : ''
  const end_time = typeof req.body.end_time === 'string' ? req.body.end_time.trim() : ''

  if (!project_id) {
    return res.status(400).json({ error: 'project_id is required' })
  }

  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required' })
  }

  if (!work_date) {
    return res.status(400).json({ error: 'work_date is required' })
  }

  if (!start_time) {
    return res.status(400).json({ error: 'start_time is required' })
  }

  if (!end_time) {
    return res.status(400).json({ error: 'end_time is required' })
  }

  if (timeToMinutes(end_time) <= timeToMinutes(start_time)) {
    return res.status(400).json({ error: 'end_time must be after start_time' })
  }

  try {
    const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [project_id])
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project does not exist' })
    }

    const employeeResult = await pool.query(
      'SELECT id, full_name, monthly_salary FROM employees WHERE id = $1',
      [employee_id]
    )
    if (employeeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Employee does not exist' })
    }

    const assignmentResult = await pool.query(
      'SELECT id FROM project_assignments WHERE project_id = $1 AND employee_id = $2 AND is_active = true',
      [project_id, employee_id]
    )
    if (assignmentResult.rows.length === 0) {
      return res.status(400).json({ error: 'Employee is not actively assigned to this project' })
    }

    const overlapResult = await pool.query(
      `SELECT id FROM work_entries
       WHERE employee_id = $1 AND work_date = $2
         AND start_time < $4 AND end_time > $3
       LIMIT 1`,
      [employee_id, work_date, start_time, end_time]
    )
    if (overlapResult.rows.length > 0) {
      return res.status(400).json({ error: 'This employee already has an overlapping work entry on this date' })
    }

    const monthlySalary = Number(employeeResult.rows[0].monthly_salary)
    const hourlyRate = Math.round((monthlySalary / 176) * 100) / 100

    const result = await pool.query(
      `INSERT INTO work_entries (project_id, employee_id, work_date, start_time, end_time, hourly_rate_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, employee_id, to_char(work_date, 'YYYY-MM-DD') AS work_date,
                 to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
                 hourly_rate_snapshot, created_at`,
      [project_id, employee_id, work_date, start_time, end_time, hourlyRate]
    )

    const entry = result.rows[0]
    const hours = computeHours(entry.start_time, entry.end_time)

    res.status(201).json({
      ...entry,
      employee_name: employeeResult.rows[0].full_name,
      hours_worked: hours,
      labor_cost: Math.round(hours * hourlyRate * 100) / 100,
    })
  } catch {
    res.status(500).json({ error: 'Failed to create work entry' })
  }
})

app.get('/api/work-assignments', async (req, res) => {
  const { project_id, date } = req.query
  const employee_id = resolveEmployeeId(req, req.query.employee_id)

  // Either all assignments of a project (admin), or an employee's assignments covering a date (employee)
  const conditions: string[] = []
  const params: string[] = []

  if (typeof project_id === 'string' && project_id) {
    params.push(project_id)
    conditions.push(`work_assignments.project_id = $${params.length}`)
  }

  if (typeof employee_id === 'string' && employee_id) {
    params.push(employee_id)
    conditions.push(`work_assignments.employee_id = $${params.length}`)
  }

  if (typeof date === 'string' && date) {
    params.push(date)
    conditions.push(`work_assignments.start_date <= $${params.length} AND work_assignments.end_date >= $${params.length}`)
  }

  if (!project_id && !employee_id) {
    return res.status(400).json({ error: 'project_id or employee_id is required' })
  }

  try {
    const result = await pool.query(
      `SELECT work_assignments.id, work_assignments.project_id, projects.name AS project_name,
              work_assignments.employee_id, employees.full_name AS employee_name,
              to_char(work_assignments.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(work_assignments.end_date, 'YYYY-MM-DD') AS end_date,
              work_assignments.description, work_assignments.created_at
       FROM work_assignments
       JOIN employees ON employees.id = work_assignments.employee_id
       JOIN projects ON projects.id = work_assignments.project_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY work_assignments.start_date DESC, work_assignments.created_at DESC`,
      params
    )
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'Failed to fetch work assignments' })
  }
})

app.post('/api/work-assignments', async (req, res) => {
  const project_id = req.body.project_id
  const employee_id = req.body.employee_id
  const start_date = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : ''
  const end_date = typeof req.body.end_date === 'string' ? req.body.end_date.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

  if (!project_id) {
    return res.status(400).json({ error: 'project_id is required' })
  }

  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required' })
  }

  if (!start_date) {
    return res.status(400).json({ error: 'start_date is required' })
  }

  if (!end_date) {
    return res.status(400).json({ error: 'end_date is required' })
  }

  // ISO YYYY-MM-DD strings compare correctly as text
  if (end_date < start_date) {
    return res.status(400).json({ error: 'end_date cannot be before start_date' })
  }

  if (!description) {
    return res.status(400).json({ error: 'description is required' })
  }

  try {
    const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [project_id])
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project does not exist' })
    }

    const assignmentResult = await pool.query(
      `SELECT employees.full_name
       FROM project_assignments
       JOIN employees ON employees.id = project_assignments.employee_id
       WHERE project_assignments.project_id = $1 AND project_assignments.employee_id = $2
         AND project_assignments.is_active = true`,
      [project_id, employee_id]
    )
    if (assignmentResult.rows.length === 0) {
      return res.status(400).json({ error: 'Employee is not actively assigned to this project' })
    }

    const result = await pool.query(
      `INSERT INTO work_assignments (project_id, employee_id, start_date, end_date, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, employee_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
                 to_char(end_date, 'YYYY-MM-DD') AS end_date, description, created_at`,
      [project_id, employee_id, start_date, end_date, description]
    )

    res.status(201).json({ ...result.rows[0], employee_name: assignmentResult.rows[0].full_name })
  } catch {
    res.status(500).json({ error: 'Failed to create work assignment' })
  }
})

// ---- Employee time tracking (clock in/out + project timers) ----

function sendTimeError(res: express.Response, err: unknown, fallback: string) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  const code = (err as { code?: string }).code
  if (code === '23P01') {
    return res.status(400).json({ error: 'This overlaps another time entry for this employee' })
  }
  if (code === '23505') {
    return res.status(400).json({ error: 'This employee already has an active timer or is already clocked in' })
  }
  res.status(500).json({ error: fallback })
}

// Locks the employee's open clock-in row (serialises double clicks) and returns it plus one consistent "now"
async function lockOpenSession(client: PoolClient, employeeId: unknown) {
  const session = await client.query(
    'SELECT id FROM attendance WHERE employee_id = $1 AND clock_out IS NULL FOR UPDATE',
    [employeeId]
  )
  if (session.rows.length === 0) {
    throw new HttpError(400, 'Clock in first')
  }
  const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date
  return { sessionId: session.rows[0].id as string, now }
}

app.get('/api/time/status', async (req, res) => {
  const employee_id = resolveEmployeeId(req, req.query.employee_id)
  if (typeof employee_id !== 'string' || !employee_id) {
    return res.status(400).json({ error: 'employee_id is required' })
  }

  try {
    const session = await pool.query(
      'SELECT id, clock_in FROM attendance WHERE employee_id = $1 AND clock_out IS NULL',
      [employee_id]
    )
    const active = await pool.query(
      `SELECT time_entries.id, time_entries.project_id, projects.name AS project_name, time_entries.started_at
       FROM time_entries JOIN projects ON projects.id = time_entries.project_id
       WHERE time_entries.employee_id = $1 AND time_entries.ended_at IS NULL`,
      [employee_id]
    )
    res.json({ session: session.rows[0] ?? null, active_entry: active.rows[0] ?? null })
  } catch {
    res.status(500).json({ error: 'Failed to fetch status' })
  }
})

// Sessions and entries that started within [from, to) — the client sends the local-day boundaries
app.get('/api/time/day', async (req, res) => {
  const { from, to } = req.query
  const employee_id = resolveEmployeeId(req, req.query.employee_id)
  if (typeof employee_id !== 'string' || !employee_id || typeof from !== 'string' || typeof to !== 'string') {
    return res.status(400).json({ error: 'employee_id, from and to are required' })
  }

  try {
    const sessions = await pool.query(
      `SELECT id, clock_in, clock_out FROM attendance
       WHERE employee_id = $1 AND clock_in >= $2 AND clock_in < $3
       ORDER BY clock_in`,
      [employee_id, from, to]
    )
    const entries = await pool.query(
      `SELECT time_entries.id, time_entries.project_id, projects.name AS project_name,
              time_entries.started_at, time_entries.ended_at, time_entries.description, time_entries.status
       FROM time_entries JOIN projects ON projects.id = time_entries.project_id
       WHERE time_entries.employee_id = $1 AND time_entries.started_at >= $2 AND time_entries.started_at < $3
       ORDER BY time_entries.started_at`,
      [employee_id, from, to]
    )
    res.json({ sessions: sessions.rows, entries: entries.rows })
  } catch {
    res.status(500).json({ error: 'Failed to fetch time entries' })
  }
})

app.post('/api/time/clock-in', async (req, res) => {
  const employee_id = resolveEmployeeId(req, req.body.employee_id)
  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required' })
  }

  try {
    const employee = await pool.query('SELECT id FROM employees WHERE id = $1 AND is_active = true', [employee_id])
    if (employee.rows.length === 0) {
      return res.status(400).json({ error: 'Employee does not exist or is inactive' })
    }
    await pool.query('INSERT INTO attendance (employee_id, clock_in) VALUES ($1, clock_timestamp())', [employee_id])
    res.status(201).json({ ok: true })
  } catch (err) {
    sendTimeError(res, err, 'Failed to clock in')
  }
})

app.post('/api/time/start', async (req, res) => {
  const { project_id, date } = req.body
  const employee_id = resolveEmployeeId(req, req.body.employee_id)
  if (!employee_id || !project_id || typeof date !== 'string' || !date) {
    return res.status(400).json({ error: 'employee_id, project_id and date are required' })
  }

  try {
    await withTransaction(async (client) => {
      const { now } = await lockOpenSession(client, employee_id)

      // The client sends its local date; it may only differ from the server date by timezone (at most a day)
      const dateCheck = await client.query(`SELECT abs($1::date - current_date) <= 1 AS ok`, [date])
      if (!dateCheck.rows[0].ok) {
        throw new HttpError(400, 'Invalid date')
      }

      const assigned = await client.query(
        `SELECT 1 FROM work_assignments
         WHERE employee_id = $1 AND project_id = $2 AND start_date <= $3 AND end_date >= $3 LIMIT 1`,
        [employee_id, project_id, date]
      )
      if (assigned.rows.length === 0) {
        throw new HttpError(400, 'This project is not assigned to you today')
      }

      const active = await client.query(
        'SELECT id, project_id FROM time_entries WHERE employee_id = $1 AND ended_at IS NULL',
        [employee_id]
      )
      if (active.rows.length > 0) {
        if (String(active.rows[0].project_id) === String(project_id)) {
          throw new HttpError(400, 'You are already working on this project')
        }
        // Switching projects: stop the current one at exactly the moment the next one starts
        await client.query('UPDATE time_entries SET ended_at = $2 WHERE id = $1', [active.rows[0].id, now])
      }

      // Freeze the hourly labor rate on the entry so later salary edits don't change past costs
      const salary = await client.query('SELECT monthly_salary FROM employees WHERE id = $1', [employee_id])
      const rate = hourlyRateFromSalary(Number(salary.rows[0].monthly_salary))

      await client.query(
        'INSERT INTO time_entries (employee_id, project_id, started_at, hourly_rate_snapshot) VALUES ($1, $2, $3, $4)',
        [employee_id, project_id, now, rate]
      )
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    sendTimeError(res, err, 'Failed to start work')
  }
})

// Manual entry: the employee forgot to start or stop the timer, or worked on a project before the admin
// assigned it. An entry on an already-assigned project is saved exactly like a finished timer entry (same
// table, same frozen hourly rate), so hours, project totals and labor cost all pick it up automatically.
// An entry on a project the employee isn't assigned to is saved as 'pending' instead: it is held for admin
// review and excluded from every hours/cost total until approved (see recordedTimeByProjectEmployee).
app.post('/api/time/manual', async (req, res) => {
  // an employee can only ever add time for themselves
  const employee_id = resolveEmployeeId(req, req.body.employee_id)
  const { project_id, date, start, end, day_start, day_end } = req.body
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

  try {
    if (!employee_id) throw new HttpError(400, 'employee_id is required')
    if (!project_id) throw new HttpError(400, 'Choose a project')
    if (!isIsoDate(date)) throw new HttpError(400, 'Choose a date')
    const startAt = new Date(start)
    const endAt = new Date(end)
    const dayStart = new Date(day_start)
    const dayEnd = new Date(day_end)
    if ([startAt, endAt, dayStart, dayEnd].some((value) => Number.isNaN(value.getTime()))) {
      throw new HttpError(400, 'Enter a start time and an end time')
    }
    if (!description) throw new HttpError(400, 'Describe what you worked on')
    if (description.length > 2000) throw new HttpError(400, 'The description is too long (2000 characters at most)')
    if (endAt <= startAt) throw new HttpError(400, 'End time must be after start time')

    // The chosen day is a 23-25 hour window (daylight saving) and the whole entry must sit inside it
    const dayHours = (dayEnd.getTime() - dayStart.getTime()) / 3600000
    if (dayHours < 23 || dayHours > 25) throw new HttpError(400, 'Invalid date')
    if (startAt < dayStart || endAt > dayEnd) throw new HttpError(400, 'The start and end times must be on the selected date')

    const entryStatus = await withTransaction(async (client) => {
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date
      if (endAt > now) throw new HttpError(400, 'Work cannot be added in the future')

      // Projects assigned to this employee on the selected date save normally. A project they are not
      // assigned to is still allowed, as long as it exists and is open for work, but is held as 'pending'
      // until an admin approves it (see /api/pending-work-entries below) — it bypasses only this check.
      const assigned = await client.query(
        `SELECT 1 FROM work_assignments
         WHERE employee_id = $1 AND project_id = $2 AND start_date <= $3 AND end_date >= $3 LIMIT 1`,
        [employee_id, project_id, date]
      )
      let status: 'approved' | 'pending' = 'approved'
      if (assigned.rows.length === 0) {
        const project = await client.query(`SELECT status FROM projects WHERE id = $1`, [project_id])
        if (project.rows.length === 0) throw new HttpError(400, 'Project does not exist')
        if (!['planning', 'in_progress'].includes(project.rows[0].status)) {
          throw new HttpError(400, 'Choose an active project')
        }
        status = 'pending'
      }

      // never overlap another entry, including a project timer that is running right now
      // (a rejected entry never really happened, so it doesn't block a new submission)
      const overlap = await client.query(
        `SELECT ended_at FROM time_entries
         WHERE employee_id = $1 AND status <> 'rejected' AND tstzrange(started_at, ended_at) && tstzrange($2, $3) LIMIT 1`,
        [employee_id, startAt, endAt]
      )
      if (overlap.rows.length > 0) {
        throw new HttpError(
          400,
          overlap.rows[0].ended_at === null
            ? 'This overlaps the project timer that is running right now'
            : 'This overlaps another work entry of yours'
        )
      }

      // Attendance (Clock In/Out) and project work tracking are separate on purpose: real attendance is
      // verified externally (Hikvision/Hik-Connect), so a manual work entry is never required to fall
      // inside — or even have — a Clock In/Out session in this app.

      // same frozen hourly rate as a timer entry
      const salary = await client.query('SELECT monthly_salary FROM employees WHERE id = $1', [employee_id])
      if (salary.rows.length === 0) throw new HttpError(400, 'Employee does not exist')
      const rate = hourlyRateFromSalary(Number(salary.rows[0].monthly_salary))

      await client.query(
        `INSERT INTO time_entries (employee_id, project_id, started_at, ended_at, hourly_rate_snapshot, description, source, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)`,
        [employee_id, project_id, startAt, endAt, rate, description, status]
      )
      return status
    })
    res.status(201).json({ ok: true, status: entryStatus })
  } catch (err) {
    sendTimeError(res, err, 'Failed to add the work entry')
  }
})

app.post('/api/time/stop', async (req, res) => {
  const employee_id = resolveEmployeeId(req, req.body.employee_id)
  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required' })
  }

  try {
    await withTransaction(async (client) => {
      const { now } = await lockOpenSession(client, employee_id)
      const stopped = await client.query(
        'UPDATE time_entries SET ended_at = $2 WHERE employee_id = $1 AND ended_at IS NULL',
        [employee_id, now]
      )
      if (stopped.rowCount === 0) {
        throw new HttpError(400, 'No project is running')
      }
    })
    res.json({ ok: true })
  } catch (err) {
    sendTimeError(res, err, 'Failed to stop work')
  }
})

app.post('/api/time/clock-out', async (req, res) => {
  const employee_id = resolveEmployeeId(req, req.body.employee_id)
  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required' })
  }

  try {
    await withTransaction(async (client) => {
      const { sessionId, now } = await lockOpenSession(client, employee_id)
      await client.query('UPDATE time_entries SET ended_at = $2 WHERE employee_id = $1 AND ended_at IS NULL', [
        employee_id,
        now,
      ])
      await client.query('UPDATE attendance SET clock_out = $2 WHERE id = $1', [sessionId, now])
    })
    res.json({ ok: true })
  } catch (err) {
    sendTimeError(res, err, 'Failed to clock out')
  }
})

// Admin corrections. Times are ISO timestamps; end may be null to leave the item running/clocked in.
function parseCorrection(body: { start?: unknown; end?: unknown }) {
  const start = typeof body.start === 'string' ? new Date(body.start) : null
  const end = typeof body.end === 'string' && body.end ? new Date(body.end) : null
  if (!start || Number.isNaN(start.getTime())) {
    throw new HttpError(400, 'A valid start time is required')
  }
  if (end && Number.isNaN(end.getTime())) {
    throw new HttpError(400, 'End time is invalid')
  }
  if (end && end <= start) {
    throw new HttpError(400, 'End time must be after start time')
  }
  return { start, end }
}

app.patch('/api/time/entries/:id', async (req, res) => {
  try {
    const { start, end } = parseCorrection(req.body)
    const result = await pool.query(
      'UPDATE time_entries SET started_at = $2, ended_at = $3 WHERE id = $1 RETURNING id',
      [req.params.id, start, end]
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Time entry not found' })
    }
    res.json({ ok: true })
  } catch (err) {
    sendTimeError(res, err, 'Failed to update time entry')
  }
})

app.patch('/api/time/sessions/:id', async (req, res) => {
  try {
    const { start, end } = parseCorrection(req.body)
    const result = await pool.query(
      'UPDATE attendance SET clock_in = $2, clock_out = $3 WHERE id = $1 RETURNING id',
      [req.params.id, start, end]
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Clock-in record not found' })
    }
    res.json({ ok: true })
  } catch (err) {
    sendTimeError(res, err, 'Failed to update clock-in record')
  }
})

// ---- Admin: manual work entries waiting for approval (projects the employee wasn't assigned to yet) ----

app.get('/api/pending-work-entries', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT time_entries.id, time_entries.employee_id, employees.full_name AS employee_name,
              time_entries.project_id, projects.name AS project_name,
              time_entries.started_at, time_entries.ended_at, time_entries.description, time_entries.status
       FROM time_entries
       JOIN employees ON employees.id = time_entries.employee_id
       JOIN projects ON projects.id = time_entries.project_id
       WHERE time_entries.status IN ('pending', 'rejected')
       ORDER BY (time_entries.status = 'pending') DESC, time_entries.started_at DESC`
    )
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'Failed to fetch pending work entries' })
  }
})

app.post('/api/pending-work-entries/:id/reject', async (req, res) => {
  try {
    // kept in history as 'rejected', never deleted; only a still-pending request can be rejected
    const result = await pool.query(
      `UPDATE time_entries SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING id`,
      [req.params.id]
    )
    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'This request was already reviewed' })
    }
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to reject the work entry' })
  }
})

// Approves a pending entry and, unless the employee is already assigned to the project on that date,
// creates the matching work assignment in the same transaction — never an approved entry with no assignment.
app.post('/api/pending-work-entries/:id/approve', async (req, res) => {
  const start_date = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : ''
  const end_date = typeof req.body.end_date === 'string' ? req.body.end_date.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

  try {
    await withTransaction(async (client) => {
      const entryResult = await client.query(
        `SELECT id, employee_id, project_id, started_at, to_char(started_at, 'YYYY-MM-DD') AS entry_date, status
         FROM time_entries WHERE id = $1 FOR UPDATE`,
        [req.params.id]
      )
      if (entryResult.rows.length === 0) throw new HttpError(404, 'Work entry not found')
      const entry = entryResult.rows[0]
      if (entry.status !== 'pending') throw new HttpError(400, 'This request was already reviewed')

      const covered = await client.query(
        `SELECT 1 FROM work_assignments
         WHERE employee_id = $1 AND project_id = $2 AND start_date <= $3 AND end_date >= $3 LIMIT 1`,
        [entry.employee_id, entry.project_id, entry.entry_date]
      )

      if (covered.rows.length === 0) {
        // Not covered yet: create the assignment now, exactly as "Assign Work" would
        if (!isIsoDate(start_date)) throw new HttpError(400, 'Assignment start date is required')
        if (!isIsoDate(end_date)) throw new HttpError(400, 'Assignment end date is required')
        if (end_date < start_date) throw new HttpError(400, 'End date cannot be before start date')
        if (!description) throw new HttpError(400, 'Task description is required')
        if (start_date > entry.entry_date || end_date < entry.entry_date) {
          throw new HttpError(400, 'This assignment does not cover the selected date')
        }
        await client.query(
          `INSERT INTO work_assignments (project_id, employee_id, start_date, end_date, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [entry.project_id, entry.employee_id, start_date, end_date, description]
        )
      }

      await client.query(`UPDATE time_entries SET status = 'approved' WHERE id = $1`, [entry.id])
    })
    res.json({ ok: true })
  } catch (err) {
    sendTimeError(res, err, 'Failed to approve the work entry')
  }
})

// ---- Admin: project details and edits ----

// ---- Project money: the single place labor cost and revenue are calculated ----


// Real recorded time per (project, employee). Running entries count up to now; cost uses each entry's frozen rate.
// Pass a project id for one project, or nothing for all projects.
// A 'pending' entry (unassigned project, awaiting admin approval) and a 'rejected' one never count here.
async function recordedTimeByProjectEmployee(projectId?: string) {
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

// Each employee's cost is rounded to cents, then summed, so the totals always add up to the rows shown
function totalLaborCost(rows: { cost: string }[]) {
  return roundMoney(rows.reduce((sum, row) => sum + roundMoney(Number(row.cost)), 0))
}

// Pending fees count as $0 revenue; only a confirmed fee is revenue
function confirmedRevenue(project: { fee_status: string; total_fee: string | null }) {
  return project.fee_status === 'confirmed' ? Number(project.total_fee) : 0
}

// Amount (confirmed revenue), labor cost deducted and remaining for every project. The single place these are combined.
async function projectFinancials() {
  const projects = await pool.query('SELECT id, name, fee_status, status, total_fee FROM projects ORDER BY name')
  const time = await recordedTimeByProjectEmployee()

  return projects.rows.map((project) => {
    const amount = confirmedRevenue(project)
    const deducted = totalLaborCost(time.filter((row) => String(row.project_id) === String(project.id)))
    return {
      project_id: project.id,
      name: project.name,
      fee_status: project.fee_status as string,
      status: project.status as string,
      entered_fee: project.total_fee === null ? null : Number(project.total_fee),
      amount,
      deducted,
      remaining: roundMoney(amount - deducted),
    }
  })
}

// Numbers only, for every project
app.get('/api/project-financial-summary', async (_req, res) => {
  try {
    res.json(await projectFinancials())
  } catch {
    res.status(500).json({ error: 'Failed to fetch financial summary' })
  }
})

// Company overview for the admin Dashboard. Three different things are kept apart on purpose:
//   value of approved work (confirmed fees), cash actually collected (payments), cost of employee time (labor).
app.get('/api/dashboard', async (req, res) => {
  try {
    const projects = await projectFinancials()
    const sum = (values: number[]) => roundMoney(values.reduce((total, value) => total + value, 0))

    // Confirmed projects carry revenue; pending ones have $0 revenue, so their labor cost is money spent ahead of approval
    const confirmed = projects.filter((project) => project.fee_status === 'confirmed')
    const pending = projects.filter((project) => project.fee_status !== 'confirmed')
    const confirmedValue = sum(confirmed.map((project) => project.amount))
    const laborCost = sum(confirmed.map((project) => project.deducted))

    // Invoices and cash come from the invoice records themselves (payments are summed there)
    const invoices = await listInvoices()
    const invoiced = sum(invoices.map((invoice) => Number(invoice.total)))
    // cash actually collected: every payment record, whether or not it is applied to an invoice
    const paymentsReceived = roundMoney(Number((await pool.query('SELECT coalesce(sum(amount), 0) AS total FROM payments')).rows[0].total))
    const recentPayments = await pool.query(
      `SELECT payments.id, payments.project_id, projects.name AS project_name, clients.name AS client_name,
              to_char(payments.payment_date, 'YYYY-MM-DD') AS payment_date, payments.amount, payments.reason
       FROM payments JOIN projects ON projects.id = payments.project_id JOIN clients ON clients.id = projects.client_id
       ORDER BY payments.payment_date DESC, payments.id DESC LIMIT 5`
    )

    // Open invoices first, plus the few most recent ones
    const recentInvoices = invoices
      .filter((invoice, index) => invoice.amount_due > 0 || index < 5)
      .slice(0, 10)
      .map((invoice) => ({
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        currency: invoice.currency,
        total: Number(invoice.total),
        paid: invoice.paid,
        amount_due: invoice.amount_due,
        status: invoice.status,
      }))

    // Today: the browser sends its local day boundaries
    const dayFrom = typeof req.query.day_from === 'string' ? new Date(req.query.day_from) : new Date(new Date().setUTCHours(0, 0, 0, 0))
    const dayTo = typeof req.query.day_to === 'string' ? new Date(req.query.day_to) : new Date(dayFrom.getTime() + 86400000)
    const clockedIn = await pool.query(
      `SELECT employees.full_name AS employee_name, attendance.clock_in
       FROM attendance JOIN employees ON employees.id = attendance.employee_id
       WHERE attendance.clock_out IS NULL ORDER BY attendance.clock_in`
    )
    const workingNow = await pool.query(
      `SELECT employees.full_name AS employee_name, projects.name AS project_name, time_entries.started_at
       FROM time_entries
       JOIN employees ON employees.id = time_entries.employee_id
       JOIN projects ON projects.id = time_entries.project_id
       WHERE time_entries.ended_at IS NULL AND time_entries.status = 'approved' ORDER BY time_entries.started_at`
    )
    const hoursToday = await pool.query(
      `SELECT coalesce(sum(extract(epoch FROM (coalesce(ended_at, now()) - started_at))), 0) / 3600 AS hours
       FROM time_entries WHERE started_at >= $1 AND started_at < $2 AND status = 'approved'`,
      [dayFrom, dayTo]
    )

    res.json({
      cards: {
        confirmed_value: confirmedValue,
        labor_cost: laborCost,
        project_remaining: roundMoney(confirmedValue - laborCost),
        invoiced,
        payments_received: paymentsReceived,
        // what invoices still have due (only payments applied to an invoice reduce it)
        outstanding: sum(invoices.map((invoice) => invoice.amount_due)),
        pending_exposure: sum(pending.map((project) => project.deducted)),
      },
      projects: projects.map((project) => ({
        project_id: project.project_id,
        name: project.name,
        fee_status: project.fee_status,
        amount: project.amount,
        deducted: project.deducted,
        remaining: project.remaining,
      })),
      invoices: recentInvoices,
      recent_payments: recentPayments.rows,
      today: {
        clocked_in: clockedIn.rows,
        working_now: workingNow.rows,
        hours_recorded: Number(hoursToday.rows[0].hours),
      },
    })
  } catch (err) {
    console.error('dashboard failed', err)
    res.status(500).json({ error: 'Failed to load the dashboard' })
  }
})

app.get('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params
  if (!/^\d+$/.test(projectId)) {
    return res.status(404).json({ error: 'Project not found' })
  }

  try {
    const projectResult = await pool.query(
      `SELECT projects.id, projects.client_id, clients.name AS client_name, projects.name,
              projects.description, projects.location, projects.total_fee, projects.fee_status, projects.source_estimate_id,
              to_char(projects.start_date, 'YYYY-MM-DD') AS start_date, projects.status
       FROM projects JOIN clients ON clients.id = projects.client_id
       WHERE projects.id = $1`,
      [projectId]
    )
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' })
    }

    // Everyone assigned to the project, given a task on it, or who recorded time on it
    const employeeResult = await pool.query(
      `SELECT id, full_name, position, monthly_salary FROM employees
       WHERE id IN (
         SELECT employee_id FROM project_assignments WHERE project_id = $1 AND is_active = true
         UNION SELECT employee_id FROM work_assignments WHERE project_id = $1
         UNION SELECT employee_id FROM time_entries WHERE project_id = $1 AND status = 'approved'
       )
       ORDER BY full_name`,
      [projectId]
    )

    const taskResult = await pool.query(
      `SELECT employee_id, to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date, description
       FROM work_assignments WHERE project_id = $1 ORDER BY start_date`,
      [projectId]
    )

    const timeRows = await recordedTimeByProjectEmployee(projectId)
    const timeByEmployee = new Map(timeRows.map((row) => [String(row.employee_id), row]))

    const employees = employeeResult.rows.map((employee) => {
      const time = timeByEmployee.get(String(employee.id))
      const hours = time ? Number(time.hours) : 0
      const laborCost = time ? roundMoney(Number(time.cost)) : 0
      return {
        employee_id: employee.id,
        full_name: employee.full_name,
        position: employee.position,
        assignments: taskResult.rows.filter((task) => String(task.employee_id) === String(employee.id)),
        hours_worked: hours,
        // Effective rate of the work actually done; the current rate if nothing has been recorded yet
        hourly_cost: time && hours > 0 ? Number(time.cost) / hours : hourlyRateFromSalary(Number(employee.monthly_salary)),
        labor_cost: laborCost,
      }
    })

    const project = projectResult.rows[0]
    const laborCostTotal = totalLaborCost(timeRows)
    const revenue = confirmedRevenue(project)

    const paymentRows = await pool.query(
      `SELECT id, to_char(payment_date, 'YYYY-MM-DD') AS payment_date, reason, amount, method, invoice_id
       FROM payments WHERE project_id = $1 ORDER BY payment_date DESC, id DESC`,
      [projectId]
    )
    const paymentsReceived = roundMoney(paymentRows.rows.reduce((total, row) => total + Number(row.amount), 0))

    res.json({
      project,
      employees,
      payments: paymentRows.rows,
      payments_received: paymentsReceived,
      // what the client still owes on the confirmed project value; unrelated to employee labor cost
      client_balance_due: roundMoney(revenue - paymentsReceived),
      total_hours: employees.reduce((sum, e) => sum + e.hours_worked, 0),
      total_labor_cost: laborCostTotal,
      confirmed_revenue: revenue,
      current_position: roundMoney(revenue - laborCostTotal),
    })
  } catch {
    res.status(500).json({ error: 'Failed to fetch project details' })
  }
})

app.put('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params
  const client_id = req.body.client_id
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null
  const start_date = req.body.start_date ? req.body.start_date : null
  const status = req.body.status
  let fee
  try {
    fee = parseFee(req.body)
  } catch (err) {
    return sendTimeError(res, err, 'Invalid fee')
  }

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' })
  }
  if (!name) {
    return res.status(400).json({ error: 'name is required' })
  }
  if (start_date !== null && !isIsoDate(start_date)) {
    return res.status(400).json({ error: 'start_date must be a valid date' })
  }
  if (!PROJECT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status must be one of: ' + PROJECT_STATUSES.join(', ') })
  }

  try {
    const clientResult = await pool.query('SELECT name FROM clients WHERE id = $1', [client_id])
    if (clientResult.rows.length === 0) {
      return res.status(400).json({ error: 'Client does not exist' })
    }

    const result = await pool.query(
      `UPDATE projects SET client_id = $2, name = $3, description = $4, total_fee = $5, fee_status = $6,
                            start_date = $7, status = $8
       WHERE id = $1
       RETURNING id, client_id, name, description, total_fee, fee_status,
                 to_char(start_date, 'YYYY-MM-DD') AS start_date, status, created_at`,
      [projectId, client_id, name, description, fee.total_fee, fee.fee_status, start_date, status]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' })
    }

    res.json({ ...result.rows[0], client_name: clientResult.rows[0].name })
  } catch {
    res.status(500).json({ error: 'Failed to update project' })
  }
})

// Permanently removes a project and everything that belongs to it. The client and employees are kept.
app.delete('/api/projects/:projectId', async (req, res) => {
  const { projectId } = req.params
  if (!/^\d+$/.test(projectId)) {
    return res.status(404).json({ error: 'Project not found' })
  }

  try {
    await withTransaction(async (client) => {
      const project = await client.query(
        'SELECT id, source_invoice_id, source_estimate_id FROM projects WHERE id = $1 FOR UPDATE',
        [projectId]
      )
      if (project.rows.length === 0) {
        throw new HttpError(404, 'Project not found')
      }
      const { source_invoice_id: invoiceId, source_estimate_id: estimateId } = project.rows[0]

      // Every payment recorded against the project (applied to its invoice or not) goes with it, then the invoice (items go with it)
      await client.query('DELETE FROM payments WHERE project_id = $1 OR ($2::bigint IS NOT NULL AND invoice_id = $2)', [projectId, invoiceId])
      if (invoiceId) {
        await client.query('DELETE FROM invoices WHERE id = $1', [invoiceId])
      }
      // Every table that references projects (all foreign keys are RESTRICT, so children go first)
      for (const table of [
        'time_entries',
        'work_assignments',
        'project_assignments',
        'work_entries',
        'project_services',
        'transactions',
      ]) {
        await client.query(`DELETE FROM ${table} WHERE project_id = $1`, [projectId])
      }
      await client.query('DELETE FROM projects WHERE id = $1', [projectId])
      // ...and so does the quotation it was created from (its items are removed with it)
      if (estimateId) {
        await client.query('DELETE FROM estimates WHERE id = $1', [estimateId])
      }
    })
    res.json({ ok: true })
  } catch (err) {
    sendTimeError(res, err, 'Failed to delete project')
  }
})

app.put('/api/employees/:employeeId', async (req, res) => {
  const { employeeId } = req.params
  const full_name = typeof req.body.full_name === 'string' ? req.body.full_name.trim() : ''
  const position = typeof req.body.position === 'string' ? req.body.position.trim() : ''
  const monthly_salary = req.body.monthly_salary
  const is_active = req.body.is_active

  if (!full_name) {
    return res.status(400).json({ error: 'full_name is required' })
  }
  if (!position) {
    return res.status(400).json({ error: 'position is required' })
  }
  if (typeof monthly_salary !== 'number' || Number.isNaN(monthly_salary) || monthly_salary < 0) {
    return res.status(400).json({ error: 'monthly_salary must be a non-negative number' })
  }
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be true or false' })
  }

  try {
    // Only the employees row changes: recorded time entries keep the hourly rate they were saved with
    const result = await pool.query(
      `UPDATE employees SET full_name = $2, position = $3, monthly_salary = $4, is_active = $5
       WHERE id = $1
       RETURNING id, full_name, position, monthly_salary, is_active, created_at`,
      [employeeId, full_name, position, monthly_salary, is_active]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' })
    }
    res.json(result.rows[0])
  } catch {
    res.status(500).json({ error: 'Failed to update employee' })
  }
})

app.put('/api/work-assignments/:assignmentId', async (req, res) => {
  const { assignmentId } = req.params
  const { project_id, employee_id } = req.body
  const start_date = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : ''
  const end_date = typeof req.body.end_date === 'string' ? req.body.end_date.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

  if (!project_id) {
    return res.status(400).json({ error: 'project_id is required' })
  }
  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id is required' })
  }
  if (!isIsoDate(start_date)) {
    return res.status(400).json({ error: 'start_date is required' })
  }
  if (!isIsoDate(end_date)) {
    return res.status(400).json({ error: 'end_date is required' })
  }
  if (end_date < start_date) {
    return res.status(400).json({ error: 'end_date cannot be before start_date' })
  }
  if (!description) {
    return res.status(400).json({ error: 'description is required' })
  }

  try {
    const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [project_id])
    if (projectResult.rows.length === 0) {
      return res.status(400).json({ error: 'Project does not exist' })
    }

    const membership = await pool.query(
      `SELECT 1 FROM project_assignments
       WHERE project_id = $1 AND employee_id = $2 AND is_active = true`,
      [project_id, employee_id]
    )
    if (membership.rows.length === 0) {
      return res.status(400).json({ error: 'Employee is not actively assigned to this project' })
    }

    // Only the assignment row changes; time entries the employee already recorded are never touched
    const result = await pool.query(
      `UPDATE work_assignments
       SET project_id = $2, employee_id = $3, start_date = $4, end_date = $5, description = $6
       WHERE id = $1 RETURNING id`,
      [assignmentId, project_id, employee_id, start_date, end_date, description]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' })
    }

    const row = await pool.query(
      `SELECT work_assignments.id, work_assignments.project_id, projects.name AS project_name,
              work_assignments.employee_id, employees.full_name AS employee_name,
              to_char(work_assignments.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(work_assignments.end_date, 'YYYY-MM-DD') AS end_date,
              work_assignments.description, work_assignments.created_at
       FROM work_assignments
       JOIN employees ON employees.id = work_assignments.employee_id
       JOIN projects ON projects.id = work_assignments.project_id
       WHERE work_assignments.id = $1`,
      [assignmentId]
    )
    res.json(row.rows[0])
  } catch {
    res.status(500).json({ error: 'Failed to update assignment' })
  }
})

const TRANSACTION_TYPES = ['income', 'expense']
const TRANSACTION_SCOPES = ['project', 'general']

app.get('/api/transactions', async (req, res) => {
  const { from, to } = req.query

  const conditions: string[] = []
  const params: string[] = []

  if (typeof from === 'string' && from) {
    params.push(from)
    conditions.push(`transaction_date >= $${params.length}`)
  }

  if (typeof to === 'string' && to) {
    params.push(to)
    conditions.push(`transaction_date <= $${params.length}`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const result = await pool.query(
      `SELECT transactions.id, transactions.type, transactions.scope, transactions.project_id,
              projects.name AS project_name, transactions.amount,
              to_char(transactions.transaction_date, 'YYYY-MM-DD') AS transaction_date,
              transactions.party_name, transactions.description, transactions.created_at
       FROM transactions
       LEFT JOIN projects ON projects.id = transactions.project_id
       ${whereClause}
       ORDER BY transactions.transaction_date DESC, transactions.created_at DESC`,
      params
    )
    res.json(result.rows)
  } catch {
    res.status(500).json({ error: 'Failed to fetch transactions' })
  }
})

app.post('/api/transactions', async (req, res) => {
  const type = req.body.type
  const scope = req.body.scope
  const project_id = req.body.project_id ?? null
  const amount = req.body.amount
  const transaction_date = typeof req.body.transaction_date === 'string' ? req.body.transaction_date.trim() : ''
  const party_name = typeof req.body.party_name === 'string' ? req.body.party_name.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null

  if (!TRANSACTION_TYPES.includes(type)) {
    return res.status(400).json({ error: 'type must be income or expense' })
  }

  if (!TRANSACTION_SCOPES.includes(scope)) {
    return res.status(400).json({ error: 'scope must be project or general' })
  }

  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' })
  }

  if (!transaction_date) {
    return res.status(400).json({ error: 'transaction_date is required' })
  }

  if (!party_name) {
    return res.status(400).json({ error: 'party_name is required' })
  }

  if (scope === 'project' && !project_id) {
    return res.status(400).json({ error: 'project_id is required when scope is project' })
  }

  if (scope === 'general' && project_id) {
    return res.status(400).json({ error: 'project_id must not be set when scope is general' })
  }

  try {
    if (scope === 'project') {
      const projectResult = await pool.query('SELECT id FROM projects WHERE id = $1', [project_id])
      if (projectResult.rows.length === 0) {
        return res.status(400).json({ error: 'Project does not exist' })
      }
    }

    const result = await pool.query(
      `INSERT INTO transactions (type, scope, project_id, amount, transaction_date, party_name, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, type, scope, project_id, amount,
                 to_char(transaction_date, 'YYYY-MM-DD') AS transaction_date,
                 party_name, description, created_at`,
      [type, scope, scope === 'project' ? project_id : null, amount, transaction_date, party_name, description]
    )

    const transaction = result.rows[0]
    let project_name = null
    if (transaction.project_id) {
      const projectResult = await pool.query('SELECT name FROM projects WHERE id = $1', [transaction.project_id])
      project_name = projectResult.rows[0]?.name ?? null
    }

    res.status(201).json({ ...transaction, project_name })
  } catch {
    res.status(500).json({ error: 'Failed to create transaction' })
  }
})

// ---- the website itself: the built front end is served by this same server ----
const publicDir = path.resolve(__dirname, '../public')
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  // hashed files under /assets never change, so they can be cached for a year; index.html must always be re-checked
  app.use(express.static(publicDir, { index: false, maxAge: '1h', setHeaders: (res, file) => {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  } }))
  // any other page address (/dashboard, /projects/9 ...) opened directly or refreshed gets the app, which then shows that page
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}

// unknown API addresses answer with JSON, never with the app's HTML
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Last resort: log the details on the server, tell the visitor only that something went wrong (never a stack trace)
app.use((err: Error & { status?: number; type?: string }, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500
  console.error(`[error] ${req.method} ${req.path}:`, status === 500 ? err : err.message)
  res.status(status).json({ error: status === 500 ? 'Something went wrong' : 'Invalid request' })
})

app.listen(Number(port), () => {
  console.log(`Server started on port ${port} (${isProduction ? 'production' : 'development'})`)
})
