// Site worker labor cost test: zero production connection.
//
// Boots the real Express server (server/dist/app.js) against an in-memory PGlite database (same technique
// as run-role-tests.cjs - see that file for details), then drives the real HTTP API directly (no browser)
// as one admin and checks the one thing FEAT-01 (site workers) is actually for: a site worker's hours cost
// the project money at their own hourly rate, and adding them never disturbs a staff member's own cost.
//
// Usage (from the repo root):
//   node server/tools/test-harness/run-site-worker-cost-test.cjs
//
// Requires: server/node_modules (pg, @electric-sql/pglite) already installed, and Node 18+ (for global fetch).

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const crypto = require('crypto')

const SERVER_DIR = path.resolve(__dirname, '..', '..')
const REPO_ROOT = path.resolve(SERVER_DIR, '..')
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations')

function log(...args) {
  console.log('[site-worker-cost]', ...args)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'PASS' : 'FAIL', '-', name, detail ? `(${detail})` : '')
}

function printReport() {
  log('')
  log('==== SITE WORKER COST CHECKS ====')
  for (const r of results) log(r.ok ? 'PASS' : 'FAIL', '-', r.name, r.detail ? `(${r.detail})` : '')
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    log(`\n${failed.length} check(s) failed.`)
    process.exitCode = 1
  } else {
    log('\nAll checks passed: a site worker\'s hours cost the project their own hourly rate, and a staff member\'s cost is never disturbed by it.')
  }
}

// ---- same scrypt scheme as server/src/modules/auth/auth.service.ts (kept in sync manually) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

// A tiny cookie-jar HTTP client, logged in as the admin.
function makeClient(baseUrl) {
  let cookie = null
  async function raw(method, pathName, body) {
    const res = await fetch(baseUrl + pathName, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    let json = null
    try {
      json = await res.json()
    } catch {
      /* no body (e.g. 204) */
    }
    return { status: res.status, json }
  }
  return {
    login: (email, password) => raw('POST', '/api/auth/login', { email, password }),
    get: (p) => raw('GET', p),
    post: (p, body) => raw('POST', p, body),
  }
}

// A calendar day safely in the past (so addManualWork's "not in the future" check never fires, whatever
// day this happens to run on), expressed in UTC so there is no local-timezone ambiguity in this script.
function pad(n) {
  return String(n).padStart(2, '0')
}
function yesterdayUtc() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

async function main() {
  log('building server...')
  execSync('npm run build', { cwd: SERVER_DIR, stdio: 'inherit' })

  // ---- patch the exact `pg` module instance the compiled server will require (same technique as
  // run-role-tests.cjs) ----
  const pgEntry = require.resolve('pg', { paths: [SERVER_DIR] })
  const { Pool } = require(pgEntry)
  const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [SERVER_DIR] }))
  const { btree_gist } = require(require.resolve('@electric-sql/pglite/contrib/btree_gist', { paths: [SERVER_DIR] }))

  const db = new PGlite({ extensions: { btree_gist } })
  await db.waitReady

  const PG_BIGINT_OID = 20

  async function adapterQuery(text, params) {
    if (text && typeof text === 'object') {
      params = text.values
      text = text.text
    }
    const result = await db.query(text, params ?? [])
    const fields = result.fields ?? []
    const bigintColumns = fields.filter((f) => f.dataTypeID === PG_BIGINT_OID).map((f) => f.name)
    const rows = bigintColumns.length
      ? result.rows.map((row) => {
          const copy = { ...row }
          for (const col of bigintColumns) {
            if (copy[col] !== null && copy[col] !== undefined) copy[col] = String(copy[col])
          }
          return copy
        })
      : result.rows
    return { rows, rowCount: result.affectedRows ?? rows.length, fields }
  }

  Pool.prototype.query = function (text, params) {
    return adapterQuery(text, params)
  }
  Pool.prototype.connect = async function () {
    return { query: adapterQuery, release: () => {} }
  }
  Pool.prototype.end = async function () {}

  log('patched pg.Pool to route through in-memory PGlite')

  process.env.DATABASE_URL = 'postgres://pglite-fake-host/pglite' // never actually dialed
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of migrationFiles) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
  }
  log(`applied ${migrationFiles.length} migrations to the in-memory database`)

  // ---- seed one company with one admin ----
  const org = await db.query("insert into organizations (name) values ('Site Worker Cost Test Co') returning id")
  const orgId = org.rows[0].id

  const ADMIN_EMAIL = 'site-worker-cost-admin@nextudio.local'
  const ADMIN_PASSWORD = 'site-worker-cost-admin-pw-12345'
  const adminUser = await db.query('insert into app_users (email, password_hash, role) values ($1, $2, $3) returning id', [
    ADMIN_EMAIL,
    hashPassword(ADMIN_PASSWORD),
    'admin',
  ])
  await db.query('insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)', [orgId, adminUser.rows[0].id, 'admin'])
  log('seeded one company with one admin login')

  // ---- boot the real server ----
  const { app } = require(path.join(SERVER_DIR, 'dist', 'app.js'))
  const httpServer = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s))
    s.on('error', reject)
  })
  const port = httpServer.address().port
  const baseUrl = `http://localhost:${port}`
  log(`server listening on ${baseUrl}`)

  try {
    const admin = makeClient(baseUrl)
    const login = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    record('admin logs in', login.status === 200, `status=${login.status}`)

    const client = await admin.post('/api/clients', { name: 'Site Worker Cost Client', contact_name: null, email: null, phone: null, address: null })
    record('create client', client.status === 201, `status=${client.status}`)
    const clientId = client.json?.id

    const project = await admin.post('/api/projects', {
      client_id: clientId,
      name: 'Site Worker Cost Project',
      status: 'in_progress',
      fee_status: 'pending',
    })
    record('create project', project.status === 201, `status=${project.status}`)
    const projectId = project.json?.id

    // A staff member - rate comes from monthly_salary via hourlyRateOf/hourlyRateFromSalary (176 hours/month).
    const STAFF_MONTHLY_SALARY = 1760 // 1760 / 176 = $10/hr, same rate as the site worker, on purpose -
    // so that if the site worker's rate were ever wrongly applied to the staff row (or vice versa) the two
    // employees' costs would still happen to match, which would hide the bug. Instead the two entries use
    // different hour counts (2h staff vs 3h site worker) so a mix-up changes the totals, not just by
    // coincidence matching.
    const staff = await admin.post('/api/employees', {
      full_name: 'Staff Member',
      position: 'Architect',
      kind: 'staff',
      monthly_salary: STAFF_MONTHLY_SALARY,
      hourly_rate: null,
      contact_email: null,
    })
    record('create staff employee', staff.status === 201, `status=${staff.status}`)
    const staffId = staff.json?.id

    const siteWorker = await admin.post('/api/employees', {
      full_name: 'Site Worker',
      position: 'Laborer',
      kind: 'site_worker',
      monthly_salary: 0,
      hourly_rate: 10,
      contact_email: null,
    })
    record('create site worker employee', siteWorker.status === 201, `status=${siteWorker.status}`)
    record('site worker is created with kind "site_worker" and hourly_rate 10', siteWorker.json?.kind === 'site_worker' && Number(siteWorker.json?.hourly_rate) === 10, JSON.stringify(siteWorker.json))
    const siteWorkerId = siteWorker.json?.id

    const workDate = yesterdayUtc()
    const dayStart = `${workDate}T00:00:00.000Z`
    const dayEnd = `${workDate}T23:59:59.999Z`

    // A work_assignments (task) row requires the employee to already be on the project's team first.
    const teamStaff = await admin.post(`/api/projects/${projectId}/assignments`, { employee_id: staffId })
    record('add staff member to the project team', teamStaff.status === 201, `status=${teamStaff.status}`)
    const teamSiteWorker = await admin.post(`/api/projects/${projectId}/assignments`, { employee_id: siteWorkerId })
    record('add site worker to the project team', teamSiteWorker.status === 201, `status=${teamSiteWorker.status}`)

    // Assign both to the project on that date so their manual entries save as 'approved' straight away,
    // not held 'pending' - the pending-approval flow is a separate concern this test isn't checking.
    const assignStaff = await admin.post('/api/work-assignments', {
      project_id: projectId,
      employee_id: staffId,
      start_date: workDate,
      end_date: workDate,
      description: 'Design work',
    })
    record('assign staff member to the project on the work date', assignStaff.status === 201, `status=${assignStaff.status}`)

    const assignSiteWorker = await admin.post('/api/work-assignments', {
      project_id: projectId,
      employee_id: siteWorkerId,
      start_date: workDate,
      end_date: workDate,
      description: 'Site labor',
    })
    record('assign site worker to the project on the work date', assignSiteWorker.status === 201, `status=${assignSiteWorker.status}`)

    // ---- staff member logs 2 hours first, as a baseline ----
    const staffEntry = await admin.post('/api/time/manual', {
      employee_id: staffId,
      project_id: projectId,
      date: workDate,
      start: `${workDate}T09:00:00.000Z`,
      end: `${workDate}T11:00:00.000Z`,
      day_start: dayStart,
      day_end: dayEnd,
      description: 'Drafting',
    })
    record('staff member logs 2 hours (approved, not pending)', staffEntry.status === 201 && staffEntry.json?.status === 'approved', JSON.stringify(staffEntry.json))

    const beforeDetail = await admin.get(`/api/projects/${projectId}`)
    const staffRowBefore = beforeDetail.json?.employees?.find((e) => String(e.employee_id) === String(staffId))
    const totalCostBefore = Number(beforeDetail.json?.total_labor_cost)
    record('staff member\'s cost after their own 2 hours is 2 * $10/hr = $20', Number(staffRowBefore?.labor_cost) === 20, `labor_cost=${staffRowBefore?.labor_cost}`)

    // ---- now the site worker logs 3 hours on the same project ----
    const siteWorkerEntry = await admin.post('/api/time/manual', {
      employee_id: siteWorkerId,
      project_id: projectId,
      date: workDate,
      start: `${workDate}T13:00:00.000Z`,
      end: `${workDate}T16:00:00.000Z`,
      day_start: dayStart,
      day_end: dayEnd,
      description: 'Pouring concrete',
    })
    record(
      'site worker logs 3 hours (approved, not pending)',
      siteWorkerEntry.status === 201 && siteWorkerEntry.json?.status === 'approved',
      JSON.stringify(siteWorkerEntry.json)
    )

    const afterDetail = await admin.get(`/api/projects/${projectId}`)
    const staffRowAfter = afterDetail.json?.employees?.find((e) => String(e.employee_id) === String(staffId))
    const siteWorkerRowAfter = afterDetail.json?.employees?.find((e) => String(e.employee_id) === String(siteWorkerId))
    const totalCostAfter = Number(afterDetail.json?.total_labor_cost)

    record(
      'site worker\'s 3 hours at $10/hr cost exactly $30',
      Number(siteWorkerRowAfter?.labor_cost) === 30 && Number(siteWorkerRowAfter?.hours_worked) === 3,
      `labor_cost=${siteWorkerRowAfter?.labor_cost} hours_worked=${siteWorkerRowAfter?.hours_worked}`
    )
    record(
      'the project\'s total labor cost increased by exactly $30 after the site worker\'s entry',
      totalCostAfter - totalCostBefore === 30,
      `before=${totalCostBefore} after=${totalCostAfter}`
    )
    record(
      'the staff member\'s own cost is completely unchanged by the site worker\'s entry',
      Number(staffRowAfter?.labor_cost) === Number(staffRowBefore?.labor_cost) && Number(staffRowAfter?.labor_cost) === 20,
      `before=${staffRowBefore?.labor_cost} after=${staffRowAfter?.labor_cost}`
    )
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
  }
}

main()
  .catch((err) => {
    console.error('[site-worker-cost] FATAL', err)
    process.exitCode = 1
  })
  .finally(() => {
    printReport()
    process.exit(process.exitCode ?? 0)
  })
