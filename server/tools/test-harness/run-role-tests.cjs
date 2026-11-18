// Role-enforcement test: zero production connection.
//
// Boots the real Express server (server/dist/app.js) against an in-memory PGlite database (same technique
// as run-isolation-tests.cjs - see that file for details), then logs in as an Employee and checks, for
// every /api route the app actually has (discovered live from the Express route table via listApiRoutes in
// dist/middleware/auth.js, so a brand-new route can never be left out of this test by accident):
//   - the 13 routes an Employee is meant to use (plus GET/POST /api/auth/me and /logout) are never refused
//     with 403
//   - every other /api route answers 403
//
// The 13 + 2 "allowed for Employees" paths below are this test's own source of truth for what an Employee
// should be able to reach - independent of whatever the route files currently declare - so a route that
// grants the wrong role still gets caught here even though the server itself boots fine.
//
// Usage (from the repo root):
//   node server/tools/test-harness/run-role-tests.cjs
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
  console.log('[roles]', ...args)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'PASS' : 'FAIL', '-', name, detail ? `(${detail})` : '')
}

function printReport() {
  log('')
  log('==== ROLE CHECKS ====')
  for (const r of results) log(r.ok ? 'PASS' : 'FAIL', '-', r.name, r.detail ? `(${r.detail})` : '')
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    log(`\n${failed.length} check(s) failed.`)
    process.exitCode = 1
  } else {
    log('\nAll role checks passed: an Employee can reach exactly the routes they should, and nothing else.')
  }
}

// ---- same scrypt scheme as server/src/modules/auth/auth.service.ts (kept in sync manually) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

// A tiny cookie-jar HTTP client, logged in as one user.
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
    call: (method, p, body) => raw(method, p, body),
  }
}

// This test's own source of truth for what an Employee should be able to reach (the 13 routes from the old
// EMPLOYEE_ROUTES allowlist, plus the 2 shared auth routes) - independent of what the route files currently
// declare, so a route that grants the wrong role is still caught even though the server boots fine.
const EMPLOYEE_ALLOWED = new Set([
  'GET /api/work-assignments',
  'GET /api/projects/active-names',
  'GET /api/time/status',
  'GET /api/time/day',
  'GET /api/time/first-activity',
  'POST /api/time/clock-in',
  'POST /api/time/start',
  'POST /api/time/stop',
  'POST /api/time/manual',
  'POST /api/time/clock-out',
  'GET /api/day-off-requests',
  'POST /api/day-off-requests',
  'POST /api/day-off-requests/cancel',
  'GET /api/auth/me',
  'POST /api/auth/logout',
])

// Routes that stay public (no authenticate/allow at all) - excluded from the role matrix entirely.
const PUBLIC_ROUTES = new Set(['GET /api/health', 'POST /api/auth/login'])

async function main() {
  log('building server...')
  execSync('npm run build', { cwd: SERVER_DIR, stdio: 'inherit' })

  // ---- patch the exact `pg` module instance the compiled server will require (same technique as
  // run-isolation-tests.cjs) ----
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

  // ---- seed one company with one admin and one employee ----
  const org = await db.query("insert into organizations (name) values ('Role Test Co') returning id")
  const orgId = org.rows[0].id

  const ADMIN_EMAIL = 'role-test-admin@nextudio.local'
  const ADMIN_PASSWORD = 'role-test-admin-pw-12345'
  const adminUser = await db.query('insert into app_users (email, password_hash, role) values ($1, $2, $3) returning id', [
    ADMIN_EMAIL,
    hashPassword(ADMIN_PASSWORD),
    'admin',
  ])
  await db.query('insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)', [orgId, adminUser.rows[0].id, 'admin'])

  const employee = await db.query(
    "insert into employees (full_name, position, monthly_salary, organization_id) values ('Role Test Employee', 'Architect', 1000, $1) returning id",
    [orgId]
  )
  const employeeId = employee.rows[0].id
  const EMPLOYEE_EMAIL = 'role-test-employee@nextudio.local'
  const EMPLOYEE_PASSWORD = 'role-test-employee-pw-12345'
  const employeeUser = await db.query('insert into app_users (email, password_hash, role, employee_id) values ($1, $2, $3, $4) returning id', [
    EMPLOYEE_EMAIL,
    hashPassword(EMPLOYEE_PASSWORD),
    'employee',
    employeeId,
  ])
  const employeeMember = await db.query('insert into organization_members (organization_id, user_id, role) values ($1, $2, $3) returning id', [
    orgId,
    employeeUser.rows[0].id,
    'employee',
  ])
  // Mirrors the backfill in supabase/migrations/20261025000000_organizations_and_members.sql: the session
  // query joins employees to the session through this column, so it must be set for the employee to log in.
  await db.query('update employees set organization_member_id = $1 where id = $2', [employeeMember.rows[0].id, employeeId])
  log('seeded one company with one admin and one employee login')

  // ---- boot the real server ----
  const { app } = require(path.join(SERVER_DIR, 'dist', 'app.js'))
  const { listApiRoutes } = require(path.join(SERVER_DIR, 'dist', 'middleware', 'auth.js'))
  const httpServer = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s))
    s.on('error', reject)
  })
  const port = httpServer.address().port
  const baseUrl = `http://localhost:${port}`
  log(`server listening on ${baseUrl}`)

  try {
    const employeeClient = makeClient(baseUrl)
    const loginEmployee = await employeeClient.login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    record('employee logs in', loginEmployee.status === 200, `status=${loginEmployee.status}`)

    // POST /api/auth/logout is tested on its own, last, with a fresh login - calling it in the main loop
    // below would end the session and turn every later check into a false "401, not 403" failure.
    const LOGOUT_KEY = 'POST /api/auth/logout'
    const routes = listApiRoutes(app).filter((r) => !PUBLIC_ROUTES.has(`${r.method} ${r.path}`) && `${r.method} ${r.path}` !== LOGOUT_KEY)
    record('every /api route was discovered automatically from the running app', routes.length > 0, `found ${routes.length} routes`)

    // Concrete, syntactically valid test values for every path param that appears anywhere, so a route like
    // /api/invoices/:invoiceId/disbursements/:disbursementId gets a real-looking URL. The role check always
    // runs before any param is read, so the exact value never matters - only that it's filled in.
    function concretePath(routePath) {
      return routePath.replace(/:[^/]+/g, '1')
    }

    for (const route of routes) {
      const key = `${route.method} ${route.path}`
      const shouldBeAllowed = EMPLOYEE_ALLOWED.has(key)
      const hasBody = route.method !== 'GET' && route.method !== 'HEAD'
      const res = await employeeClient.call(route.method, concretePath(route.path), hasBody ? {} : undefined)
      const ok = shouldBeAllowed ? res.status !== 403 : res.status === 403
      record(
        shouldBeAllowed ? `employee can reach ${key} (not refused with 403)` : `employee is refused ${key} with 403`,
        ok,
        `status=${res.status}`
      )
    }

    // Sanity check: every route this test expected to be employee-allowed was actually seen on the live app -
    // if one of the 13+2 paths were ever renamed or removed, this fails loudly instead of silently testing
    // nothing for it. (LOGOUT_KEY was filtered out of `routes` above, so it's checked separately.)
    const seenKeys = new Set([...routes.map((r) => `${r.method} ${r.path}`), LOGOUT_KEY])
    for (const expected of EMPLOYEE_ALLOWED) {
      record(`expected employee route "${expected}" still exists on the app`, seenKeys.has(expected))
    }

    // Logout, tested last with its own fresh login so ending the session doesn't affect any check above.
    const logoutClient = makeClient(baseUrl)
    const loginForLogout = await logoutClient.login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    record('employee logs in again to test logout', loginForLogout.status === 200, `status=${loginForLogout.status}`)
    const logoutRes = await logoutClient.call('POST', '/api/auth/logout', {})
    record('employee can reach POST /api/auth/logout (not refused with 403)', logoutRes.status !== 403, `status=${logoutRes.status}`)
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
  }
}

main()
  .catch((err) => {
    console.error('[roles] FATAL', err)
    process.exitCode = 1
  })
  .finally(() => {
    printReport()
    process.exit(process.exitCode ?? 0)
  })
