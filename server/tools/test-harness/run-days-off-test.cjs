// Admin-recorded days off test: zero production connection.
//
// Boots the real Express server (server/dist/app.js) against an in-memory PGlite database (same technique
// as run-role-tests.cjs - see that file for details), then drives the real HTTP API directly (no browser)
// as one admin and checks FEAT-02 (admin-recorded days off): recording a range of past weekdays creates
// one approved row per weekday, weekends inside the range are skipped, a date that already has a day off
// is skipped and reported back, a site worker is refused, and a paid day off never adds project labor cost.
//
// Usage (from the repo root):
//   node server/tools/test-harness/run-days-off-test.cjs
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
  console.log('[days-off]', ...args)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'PASS' : 'FAIL', '-', name, detail ? `(${detail})` : '')
}

function printReport() {
  log('')
  log('==== DAYS OFF CHECKS ====')
  for (const r of results) log(r.ok ? 'PASS' : 'FAIL', '-', r.name, r.detail ? `(${r.detail})` : '')
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    log(`\n${failed.length} check(s) failed.`)
    process.exitCode = 1
  } else {
    log('\nAll checks passed: recording days off creates one approved row per weekday, skips weekends and existing days off, refuses site workers, and never touches project labor cost.')
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
    del: (p) => raw('DELETE', p),
  }
}

// ---- calendar-date helpers, UTC-anchored only (no time-of-day) - mirrors the server's own isWeekend ----
function pad(n) {
  return String(n).padStart(2, '0')
}
function toDateString(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
function addDaysUtc(dateString, days) {
  const [y, m, d] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return toDateString(date)
}
function weekdayUtc(dateString) {
  const [y, m, d] = dateString.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday ... 6 = Saturday
}
function isWeekendUtc(dateString) {
  const wd = weekdayUtc(dateString)
  return wd === 0 || wd === 6
}
function mostRecentMonday(dateString) {
  let d = dateString
  while (weekdayUtc(d) !== 1) d = addDaysUtc(d, -1)
  return d
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
  const org = await db.query("insert into organizations (name) values ('Days Off Test Co') returning id")
  const orgId = org.rows[0].id

  const ADMIN_EMAIL = 'days-off-admin@nextudio.local'
  const ADMIN_PASSWORD = 'days-off-admin-pw-12345'
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

    const staff = await admin.post('/api/employees', { full_name: 'Ghida', position: 'Designer', monthly_salary: 1760 })
    record('create staff employee', staff.status === 201, `status=${staff.status}`)
    const staffId = staff.json?.id

    const siteWorker = await admin.post('/api/employees', {
      full_name: 'Site Worker',
      position: 'Laborer',
      kind: 'site_worker',
      monthly_salary: 0,
      hourly_rate: 10,
    })
    record('create site worker employee', siteWorker.status === 201, `status=${siteWorker.status}`)
    const siteWorkerId = siteWorker.json?.id

    // A Monday safely 4 weeks before "yesterday", so every date used below (up to +23 days from it) is
    // guaranteed to be in the past no matter what day of the week today actually is.
    const yesterday = addDaysUtc(toDateString(new Date()), -1)
    const baseMonday = addDaysUtc(mostRecentMonday(yesterday), -28)

    // ======================================================================
    // A: 3 consecutive past weekdays (Mon-Wed), no weekend inside -> 3 approved rows, none skipped
    // ======================================================================
    const aFrom = baseMonday
    const aTo = addDaysUtc(baseMonday, 2) // Wed
    const recordA = await admin.post('/api/day-off-requests/record', { employee_id: staffId, from: aFrom, to: aTo, is_paid: true })
    record('A: recording 3 past weekdays succeeds (201)', recordA.status === 201, `status=${recordA.status}`)
    record('A: creates exactly 3 approved rows', recordA.json?.created?.length === 3, `created=${JSON.stringify(recordA.json?.created)}`)
    record(
      'A: all 3 created rows are approved and paid (so a calendar shows them as a day off, never "missed")',
      recordA.json?.created?.every((row) => row.status === 'approved' && row.is_paid === true),
      JSON.stringify(recordA.json?.created)
    )
    record('A: nothing was skipped', recordA.json?.skipped?.length === 0, `skipped=${JSON.stringify(recordA.json?.skipped)}`)

    // ======================================================================
    // B: a 4-day range spanning a weekend (Fri..Mon, next week) -> only the 2 weekdays get rows
    // ======================================================================
    const bFrom = addDaysUtc(baseMonday, 11) // next week's Friday
    const bTo = addDaysUtc(baseMonday, 14) // the following Monday
    record('B: the range genuinely spans a weekend (sanity check on the test\'s own dates)', isWeekendUtc(addDaysUtc(bFrom, 1)) && isWeekendUtc(addDaysUtc(bFrom, 2)))
    const recordB = await admin.post('/api/day-off-requests/record', { employee_id: staffId, from: bFrom, to: bTo, is_paid: false })
    record('B: recording a range with a weekend inside succeeds (201)', recordB.status === 201, `status=${recordB.status}`)
    record('B: only the 2 weekdays (Fri, Mon) get a row - the weekend is skipped', recordB.json?.created?.length === 2, `created=${JSON.stringify(recordB.json?.created)}`)
    const bDates = await db.query('select to_char(request_date, \'YYYY-MM-DD\') as d from day_off_requests where employee_id = $1 and request_date between $2 and $3', [
      staffId,
      bFrom,
      bTo,
    ])
    record(
      'B: no row exists for either weekend date',
      !bDates.rows.some((r) => r.d === addDaysUtc(bFrom, 1) || r.d === addDaysUtc(bFrom, 2)),
      JSON.stringify(bDates.rows)
    )

    // ======================================================================
    // C: a date that already has a non-rejected day off is skipped and reported
    // ======================================================================
    const cMonday = addDaysUtc(baseMonday, 21) // third week's Monday
    const cTuesday = addDaysUtc(cMonday, 1)
    const cWednesday = addDaysUtc(cMonday, 2)
    await db.query(
      `insert into day_off_requests (employee_id, request_date, status, is_paid) values ($1, $2, 'approved', true)`,
      [staffId, cMonday]
    )
    const recordC = await admin.post('/api/day-off-requests/record', { employee_id: staffId, from: cMonday, to: cWednesday, is_paid: true })
    record('C: recording over an existing day off still succeeds (201)', recordC.status === 201, `status=${recordC.status}`)
    record('C: the already-taken date is reported as skipped', recordC.json?.skipped?.includes(cMonday), `skipped=${JSON.stringify(recordC.json?.skipped)}`)
    record(
      'C: the other 2 weekdays are still created',
      recordC.json?.created?.length === 2 && recordC.json?.created?.every((row) => row.request_date === cTuesday || row.request_date === cWednesday),
      JSON.stringify(recordC.json?.created)
    )

    // ======================================================================
    // D: a site worker is refused
    // ======================================================================
    const recordD = await admin.post('/api/day-off-requests/record', {
      employee_id: siteWorkerId,
      from: baseMonday,
      to: addDaysUtc(baseMonday, 1),
      is_paid: true,
    })
    record('D: recording a day off for a site worker is refused with 400', recordD.status === 400, `status=${recordD.status} body=${JSON.stringify(recordD.json)}`)

    // ======================================================================
    // E: a paid day off never adds project labor cost - costs stay hours-based only
    // ======================================================================
    const client = await admin.post('/api/clients', { name: 'Days Off Cost Client', contact_name: null, email: null, phone: null, address: null })
    const projectRes = await admin.post('/api/projects', { client_id: client.json?.id, name: 'Days Off Cost Project', status: 'in_progress', fee_status: 'pending' })
    const projectId = projectRes.json?.id
    const beforeDetail = await admin.get(`/api/projects/${projectId}`)
    const costBefore = Number(beforeDetail.json?.total_labor_cost)
    const eDate = addDaysUtc(baseMonday, 25)
    const recordE = await admin.post('/api/day-off-requests/record', { employee_id: staffId, from: eDate, to: eDate, is_paid: true })
    record('E: recording a paid day off succeeds', recordE.status === 201 && recordE.json?.created?.length === 1, JSON.stringify(recordE.json))
    const afterDetail = await admin.get(`/api/projects/${projectId}`)
    const costAfter = Number(afterDetail.json?.total_labor_cost)
    record('E: the project\'s total labor cost is unchanged by the paid day off', costBefore === costAfter, `before=${costBefore} after=${costAfter}`)

    // ======================================================================
    // F: admin can delete a recorded day off
    // ======================================================================
    const toDelete = recordA.json?.created?.[0]?.id
    const deleteRes = await admin.del(`/api/day-off-requests/${toDelete}`)
    record('F: admin can delete a recorded day off', deleteRes.status === 200, `status=${deleteRes.status}`)
    const afterDelete = await db.query('select 1 from day_off_requests where id = $1', [toDelete])
    record('F: the deleted row is actually gone', afterDelete.rows.length === 0)
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
  }
}

main()
  .catch((err) => {
    console.error('[days-off] FATAL', err)
    process.exitCode = 1
  })
  .finally(() => {
    printReport()
    process.exit(process.exitCode ?? 0)
  })
