import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { pool } from './db'

const app = express()
const port = process.env.PORT ?? 4000

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

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

app.get('/api/projects', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT projects.id, projects.client_id, clients.name AS client_name, projects.name,
              projects.description, projects.total_fee,
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

app.post('/api/projects', async (req, res) => {
  const client_id = req.body.client_id
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null
  const total_fee = req.body.total_fee
  const start_date = typeof req.body.start_date === 'string' && req.body.start_date ? req.body.start_date : null
  const status = req.body.status

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' })
  }

  if (!name) {
    return res.status(400).json({ error: 'name is required' })
  }

  if (typeof total_fee !== 'number' || Number.isNaN(total_fee) || total_fee < 0) {
    return res.status(400).json({ error: 'total_fee must be a non-negative number' })
  }

  if (!PROJECT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'status must be one of: ' + PROJECT_STATUSES.join(', ') })
  }

  try {
    const result = await pool.query(
      `INSERT INTO projects (client_id, name, description, total_fee, start_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, client_id, name, description, total_fee,
                 to_char(start_date, 'YYYY-MM-DD') AS start_date, status, created_at`,
      [client_id, name, description, total_fee, start_date, status]
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
