// Site visits test: zero production connection.
//
// Boots the real Express server (server/dist/app.js) against an in-memory PGlite database (same technique
// as run-days-off-test.cjs - see that file for details), then drives the real HTTP API directly (no browser)
// as an admin and an employee and checks FEAT-04/FEAT-04B (site visits, by member): an employee can log
// their own visits, the member_id they send is always ignored in favor of their own; an admin can log a
// visit for any staff member of their company, or for themselves with no employee record at all (the
// member_id they send defaults to themselves when omitted); a site worker and an inactive employee are both
// refused; a future date is refused; validation rejects a bad time/empty project/overlong note; an employee
// can only see/edit/delete their own visits and only within 7 days; an admin can edit/delete any visit in
// their company; the monthly summary's per-member and per-project counts are correct, names resolve to the
// employee's full name or (for a member with no employee record) their display name, and an employee's
// summary only ever reflects their own visits; the visitors list only offers valid visitors; and company
// isolation holds (can't see/use another company's member or project).
//
// Usage (from the repo root):
//   node server/tools/test-harness/run-site-visits-test.cjs
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
  console.log('[site-visits]', ...args)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'PASS' : 'FAIL', '-', name, detail ? `(${detail})` : '')
}

function printReport() {
  log('')
  log('==== SITE VISITS CHECKS ====')
  for (const r of results) log(r.ok ? 'PASS' : 'FAIL', '-', r.name, r.detail ? `(${r.detail})` : '')
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    log(`\n${failed.length} check(s) failed.`)
    process.exitCode = 1
  } else {
    log('\nAll checks passed: visitors are organization members (an admin with no employee record included), employees log only their own visits, admins can manage any in their company, site workers/inactive employees are refused, the 7-day edit window and company isolation both hold, and summary counts and names are correct.')
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
    get: (p) => raw('GET', p),
    post: (p, body) => raw('POST', p, body),
    patch: (p, body) => raw('PATCH', p, body),
    del: (p) => raw('DELETE', p),
  }
}

// ---- calendar-date helpers, UTC-anchored only (no time-of-day) ----
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

async function main() {
  log('building server...')
  execSync('npm run build', { cwd: SERVER_DIR, stdio: 'inherit' })

  // ---- patch the exact `pg` module instance the compiled server will require (same technique as
  // run-days-off-test.cjs) ----
  const pgEntry = require.resolve('pg', { paths: [SERVER_DIR] })
  const { Pool } = require(pgEntry)
  const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [SERVER_DIR] }))
  const { btree_gist } = require(require.resolve('@electric-sql/pglite/contrib/btree_gist', { paths: [SERVER_DIR] }))

  const db = new PGlite({ extensions: { btree_gist } })
  await db.waitReady

  const PG_BIGINT_OID = 20

  async function adapterQuery(text, params) {
    let rowMode
    if (text && typeof text === 'object') {
      params = text.values
      rowMode = text.rowMode
      text = text.text
    }
    const result = await db.query(text, params ?? [], rowMode ? { rowMode } : undefined)
    const fields = result.fields ?? []
    const bigintColumns = fields.filter((f) => f.dataTypeID === PG_BIGINT_OID).map((f) => f.name)
    let rows = result.rows
    if (bigintColumns.length) {
      if (rowMode === 'array') {
        const bigintIdx = fields.map((f) => f.dataTypeID === PG_BIGINT_OID)
        rows = result.rows.map((row) => {
          const copy = [...row]
          for (let i = 0; i < copy.length; i++) {
            if (bigintIdx[i] && copy[i] !== null && copy[i] !== undefined) copy[i] = String(copy[i])
          }
          return copy
        })
      } else {
        rows = result.rows.map((row) => {
          const copy = { ...row }
          for (const col of bigintColumns) {
            if (copy[col] !== null && copy[col] !== undefined) copy[col] = String(copy[col])
          }
          return copy
        })
      }
    }
    return { rows, rowCount: result.affectedRows ?? rows.length, fields }
  }

  Pool.prototype.query = function (text, params) {
    return adapterQuery(text, params)
  }
  Pool.prototype.connect = async function () {
    const client = { query: adapterQuery, release: () => {} }
    client.on = () => client
    client.once = () => client
    client.removeListener = () => client
    return client
  }
  Pool.prototype.end = async function () {}

  log('patched pg.Pool to route through in-memory PGlite')

  process.env.DATABASE_URL = 'postgres://pglite-fake-host/pglite' // never actually dialed
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of migrationFiles) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
  }
  log(`applied ${migrationFiles.length} migrations to the in-memory database`)

  // PGlite's raw db.query() (unlike the patched Pool it feeds the app through) returns bigint columns as a
  // plain JS number, not a string - every id used in an HTTP body or compared against the app's own (always
  // stringified) response must be coerced with this, or zod's idString (and plain === comparisons) silently fail.
  function id(row) {
    return String(row.id)
  }

  // Inserts an app_users login plus its organization_members row (a "badge"), optionally linked to an
  // existing employee row - this is what makes a person (employee or bare admin) an eligible site visitor.
  async function createLogin(orgId, email, password, role, employeeIdToLink) {
    const user = await db.query('insert into app_users (email, password_hash, role, employee_id) values ($1, $2, $3, $4) returning id', [
      email,
      hashPassword(password),
      role,
      employeeIdToLink ?? null,
    ])
    const member = await db.query('insert into organization_members (organization_id, user_id, role) values ($1, $2, $3) returning id', [
      orgId,
      user.rows[0].id,
      role,
    ])
    if (employeeIdToLink) {
      await db.query('update employees set organization_member_id = $1 where id = $2', [member.rows[0].id, employeeIdToLink])
    }
    return { userId: id(user.rows[0]), memberId: id(member.rows[0]) }
  }

  // ---- seed company A: one admin (no employee record - mo@/omar@'s situation), one staff employee
  // (Ramadan, with a login), one staff employee (Omar, with a login), one site worker (with a login), one
  // inactive staff employee (with a login), and one project ----
  const orgA = await db.query("insert into organizations (name) values ('Site Visits Co A') returning id")
  const orgIdA = id(orgA.rows[0])

  const ADMIN_EMAIL = 'site-visits-admin@nextudio.local'
  const ADMIN_PASSWORD = 'site-visits-admin-pw-12345'
  const admin1 = await createLogin(orgIdA, ADMIN_EMAIL, ADMIN_PASSWORD, 'admin')
  const adminUserId = admin1.userId
  const adminMemberId = admin1.memberId

  const ramadan = await db.query(
    "insert into employees (full_name, position, monthly_salary, organization_id, kind) values ('Ramadan', 'Site Engineer', 1500, $1, 'staff') returning id",
    [orgIdA]
  )
  const ramadanId = id(ramadan.rows[0])
  const EMPLOYEE_EMAIL = 'site-visits-employee@nextudio.local'
  const EMPLOYEE_PASSWORD = 'site-visits-employee-pw-12345'
  const ramadanLogin = await createLogin(orgIdA, EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD, 'employee', ramadanId)
  const ramadanMemberId = ramadanLogin.memberId

  const omar = await db.query(
    "insert into employees (full_name, position, monthly_salary, organization_id, kind) values ('Omar', 'Architect', 1600, $1, 'staff') returning id",
    [orgIdA]
  )
  const omarId = id(omar.rows[0])
  const omarLogin = await createLogin(orgIdA, 'site-visits-omar@nextudio.local', 'site-visits-omar-pw-12345', 'employee', omarId)
  const omarMemberId = omarLogin.memberId

  const siteWorker = await db.query(
    "insert into employees (full_name, position, monthly_salary, hourly_rate, organization_id, kind) values ('Laborer', 'Mason', 0, 10, $1, 'site_worker') returning id",
    [orgIdA]
  )
  const siteWorkerId = id(siteWorker.rows[0])
  const siteWorkerLogin = await createLogin(orgIdA, 'site-visits-laborer@nextudio.local', 'site-visits-laborer-pw-12345', 'employee', siteWorkerId)
  const siteWorkerMemberId = siteWorkerLogin.memberId

  const inactiveStaff = await db.query(
    "insert into employees (full_name, position, monthly_salary, organization_id, kind, is_active) values ('Former Employee', 'Draftsman', 1200, $1, 'staff', false) returning id",
    [orgIdA]
  )
  const inactiveStaffId = id(inactiveStaff.rows[0])
  const inactiveLogin = await createLogin(orgIdA, 'site-visits-former@nextudio.local', 'site-visits-former-pw-12345', 'employee', inactiveStaffId)
  const inactiveMemberId = inactiveLogin.memberId

  const clientA = await db.query("insert into clients (name, organization_id) values ('Site Visits Client A', $1) returning id", [orgIdA])
  const projectA = await db.query("insert into projects (client_id, name, organization_id, status, fee_status) values ($1, 'Site Visits Project A', $2, 'in_progress', 'pending') returning id", [
    clientA.rows[0].id,
    orgIdA,
  ])
  const projectId = id(projectA.rows[0])

  // ---- seed company B: one admin, one employee, one project - used only for the isolation checks ----
  const orgB = await db.query("insert into organizations (name) values ('Site Visits Co B') returning id")
  const orgIdB = id(orgB.rows[0])
  const B_EMAIL = 'site-visits-admin-b@nextudio.local'
  const B_PASSWORD = 'site-visits-admin-b-pw-12345'
  const adminB = await createLogin(orgIdB, B_EMAIL, B_PASSWORD, 'admin')
  const staffB = await db.query(
    "insert into employees (full_name, position, monthly_salary, organization_id, kind) values ('Company B Employee', 'Architect', 1000, $1, 'staff') returning id",
    [orgIdB]
  )
  const staffBLogin = await createLogin(orgIdB, 'site-visits-employee-b@nextudio.local', 'site-visits-employee-b-pw-12345', 'employee', id(staffB.rows[0]))
  const staffBMemberId = staffBLogin.memberId
  const clientB = await db.query("insert into clients (name, organization_id) values ('Site Visits Client B', $1) returning id", [orgIdB])
  const projectB = await db.query("insert into projects (client_id, name, organization_id, status, fee_status) values ($1, 'Site Visits Project B', $2, 'in_progress', 'pending') returning id", [
    clientB.rows[0].id,
    orgIdB,
  ])
  const projectIdB = id(projectB.rows[0])

  log('seeded two companies: A (admin with no employee record + employees Ramadan/Omar + a site worker + an inactive employee, all with logins + a project) and B (admin + employee + a project)')

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
    const loginAdmin = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    record('admin logs in', loginAdmin.status === 200, `status=${loginAdmin.status}`)

    const employee = makeClient(baseUrl)
    const loginEmployee = await employee.login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD)
    record('employee logs in', loginEmployee.status === 200, `status=${loginEmployee.status}`)

    const today = toDateString(new Date())
    const month = today.slice(0, 7)

    // ======================================================================
    // A: an employee logs their own visit - the member_id they send is ignored in favor of their own
    // ======================================================================
    const createA = await employee.post('/api/site-visits', {
      member_id: omarMemberId, // attempt to log it for someone else - must be ignored
      project_id: projectId,
      visit_date: today,
      start_time: '09:00',
      end_time: '10:30',
      note: 'Checked formwork',
    })
    record('A: employee can log their own visit (201)', createA.status === 201, `status=${createA.status} body=${JSON.stringify(createA.json)}`)
    record('A: the visit is recorded under the employee themselves, not the member_id they sent', createA.json?.member_id === ramadanMemberId, `member_id=${createA.json?.member_id}`)
    record('A: the visit carries the employee\'s full name', createA.json?.visitor_name === 'Ramadan', `visitor_name=${createA.json?.visitor_name}`)
    const visitAId = createA.json?.id

    // ======================================================================
    // B: an admin logs a visit for any staff member of their company
    // ======================================================================
    const createB = await admin.post('/api/site-visits', {
      member_id: omarMemberId,
      project_id: projectId,
      visit_date: today,
      start_time: '11:00',
      end_time: '12:00',
      note: null,
    })
    record('B: admin can log a visit for another staff member (201)', createB.status === 201, `status=${createB.status}`)
    record('B: the visit is recorded under the member the admin chose', createB.json?.member_id === omarMemberId, `member_id=${createB.json?.member_id}`)

    // ======================================================================
    // C: a site worker is refused
    // ======================================================================
    const createC = await admin.post('/api/site-visits', { member_id: siteWorkerMemberId, project_id: projectId, visit_date: today, start_time: '09:00' })
    record('C: logging a visit for a site worker is refused with 400', createC.status === 400, `status=${createC.status} body=${JSON.stringify(createC.json)}`)

    // ======================================================================
    // D: an inactive employee is refused
    // ======================================================================
    const createD = await admin.post('/api/site-visits', { member_id: inactiveMemberId, project_id: projectId, visit_date: today, start_time: '09:00' })
    record('D: logging a visit for an inactive employee is refused with 400', createD.status === 400, `status=${createD.status} body=${JSON.stringify(createD.json)}`)

    // ======================================================================
    // E: a future date is refused
    // ======================================================================
    const tomorrow = addDaysUtc(today, 1)
    const createE = await employee.post('/api/site-visits', { project_id: projectId, visit_date: tomorrow, start_time: '09:00' })
    record('E: a future visit_date is refused with 400', createE.status === 400, `status=${createE.status} body=${JSON.stringify(createE.json)}`)

    // ======================================================================
    // F: validation - a bad time, a missing project, and an overlong note are all refused with 400
    // ======================================================================
    const createF1 = await employee.post('/api/site-visits', { project_id: projectId, visit_date: today, start_time: '9am' })
    record('F: a malformed start_time is refused with 400', createF1.status === 400, `status=${createF1.status}`)

    const createF2 = await employee.post('/api/site-visits', { project_id: projectId, visit_date: today, start_time: '10:00', end_time: '09:00' })
    record('F: an end_time before start_time is refused with 400', createF2.status === 400, `status=${createF2.status}`)

    const createF3 = await employee.post('/api/site-visits', { visit_date: today, start_time: '09:00' })
    record('F: a missing project_id is refused with 400', createF3.status === 400, `status=${createF3.status}`)

    const createF4 = await employee.post('/api/site-visits', { project_id: projectId, visit_date: today, start_time: '09:00', note: 'x'.repeat(501) })
    record('F: a note over 500 characters is refused with 400', createF4.status === 400, `status=${createF4.status}`)

    // ======================================================================
    // G: an employee sees only their own visits; an admin sees everyone's
    // ======================================================================
    const employeeList = await employee.get(`/api/site-visits?month=${month}`)
    record('G: employee can list this month\'s visits (200)', employeeList.status === 200, `status=${employeeList.status}`)
    record(
      'G: every visit returned to the employee is their own',
      Array.isArray(employeeList.json) && employeeList.json.length > 0 && employeeList.json.every((v) => v.member_id === ramadanMemberId),
      JSON.stringify(employeeList.json)
    )

    const adminList = await admin.get(`/api/site-visits?month=${month}`)
    record('G: admin can list the whole company\'s visits (200)', adminList.status === 200, `status=${adminList.status}`)
    record(
      'G: the admin sees visits from more than one member',
      new Set((adminList.json ?? []).map((v) => v.member_id)).size >= 2,
      JSON.stringify((adminList.json ?? []).map((v) => v.member_id))
    )

    // ======================================================================
    // H: an employee cannot see, edit or delete another member's visit
    // ======================================================================
    const employeeGetOthers = await employee.get(`/api/site-visits?month=${month}&member_id=${omarMemberId}`)
    record(
      'H: an employee asking for another member\'s visits still only gets their own (member_id is ignored, same as on create)',
      Array.isArray(employeeGetOthers.json) && employeeGetOthers.json.every((v) => v.member_id === ramadanMemberId),
      JSON.stringify(employeeGetOthers.json)
    )

    const omarVisit = await db.query('select id from site_visits where member_id = $1 order by id desc limit 1', [omarMemberId])
    const omarVisitId = id(omarVisit.rows[0])

    const employeeEditOthers = await employee.patch(`/api/site-visits/${omarVisitId}`, {
      project_id: projectId,
      visit_date: today,
      start_time: '08:00',
    })
    record('H: an employee cannot edit another member\'s visit (404)', employeeEditOthers.status === 404, `status=${employeeEditOthers.status}`)

    const employeeDeleteOthers = await employee.del(`/api/site-visits/${omarVisitId}`)
    record('H: an employee cannot delete another member\'s visit (404)', employeeDeleteOthers.status === 404, `status=${employeeDeleteOthers.status}`)

    const stillThere = await db.query('select 1 from site_visits where id = $1', [omarVisitId])
    record('H: that other visit still exists', stillThere.rows.length === 1)

    // ======================================================================
    // I: an employee can edit and delete their own recent visit
    // ======================================================================
    const employeeEditOwn = await employee.patch(`/api/site-visits/${visitAId}`, {
      project_id: projectId,
      visit_date: today,
      start_time: '09:00',
      end_time: '11:00',
      note: 'Updated note',
    })
    record('I: an employee can edit their own recent visit (200)', employeeEditOwn.status === 200, `status=${employeeEditOwn.status}`)
    const afterEdit = await db.query('select note from site_visits where id = $1', [visitAId])
    record('I: the edit actually took effect', afterEdit.rows[0]?.note === 'Updated note', JSON.stringify(afterEdit.rows[0]))

    // ======================================================================
    // J: an employee cannot edit or delete a visit more than 7 days old; an admin still can
    // ======================================================================
    const oldDate = addDaysUtc(today, -10)
    const oldVisit = await db.query(
      `insert into site_visits (organization_id, member_id, project_id, visit_date, start_time, created_by)
       values ($1, $2, $3, $4, '09:00', $5) returning id`,
      [orgIdA, ramadanMemberId, projectId, oldDate, adminUserId]
    )
    const oldVisitId = id(oldVisit.rows[0])

    const employeeEditOld = await employee.patch(`/api/site-visits/${oldVisitId}`, { project_id: projectId, visit_date: oldDate, start_time: '10:00' })
    record('J: an employee cannot edit a visit more than 7 days old (400)', employeeEditOld.status === 400, `status=${employeeEditOld.status} body=${JSON.stringify(employeeEditOld.json)}`)

    const employeeDeleteOld = await employee.del(`/api/site-visits/${oldVisitId}`)
    record('J: an employee cannot delete a visit more than 7 days old (400)', employeeDeleteOld.status === 400, `status=${employeeDeleteOld.status}`)

    const adminDeleteOld = await admin.del(`/api/site-visits/${oldVisitId}`)
    record('J: an admin can still delete that old visit (200)', adminDeleteOld.status === 200, `status=${adminDeleteOld.status}`)

    // ======================================================================
    // K: an admin with no employee record can log a visit for himself; the default visitor (no member_id
    // sent) is the logged-in admin; his name resolves to his display_name once set, else his email prefix
    // ======================================================================
    const createK1 = await admin.post('/api/site-visits', { project_id: projectId, visit_date: today, start_time: '07:00', end_time: '07:30' })
    record('K1: admin can log a visit with no member_id (201)', createK1.status === 201, `status=${createK1.status} body=${JSON.stringify(createK1.json)}`)
    record('K1: the default visitor is the logged-in admin himself', createK1.json?.member_id === adminMemberId, `member_id=${createK1.json?.member_id}`)
    record(
      'K1: before any display name is set, the admin\'s name is the part of his email before "@"',
      createK1.json?.visitor_name === 'site-visits-admin',
      `visitor_name=${createK1.json?.visitor_name}`
    )

    await db.query('update organization_members set display_name = $1 where id = $2', ['Mohamad Admin', adminMemberId])
    const createK2 = await admin.post('/api/site-visits', { member_id: adminMemberId, project_id: projectId, visit_date: today, start_time: '07:45', end_time: '08:00' })
    record('K2: admin can explicitly log a visit for himself (201)', createK2.status === 201, `status=${createK2.status}`)
    record('K2: once a display_name is set, it is used instead of the email prefix', createK2.json?.visitor_name === 'Mohamad Admin', `visitor_name=${createK2.json?.visitor_name}`)

    // ======================================================================
    // L: the monthly summary's per-member and per-project counts are correct (including the admin's own
    // visits, under his display_name), and an employee's own summary only ever reflects their own visits
    // ======================================================================
    const adminSummary = await admin.get(`/api/site-visits/summary?month=${month}`)
    record('L: admin can fetch the summary (200)', adminSummary.status === 200, `status=${adminSummary.status}`)
    const ramadanSummary = adminSummary.json?.by_member?.find((m) => m.member_id === ramadanMemberId)
    record('L: Ramadan\'s total_visits in the admin summary is 1 (the edited visit from A)', ramadanSummary?.total_visits === 1, JSON.stringify(ramadanSummary))
    const omarSummary = adminSummary.json?.by_member?.find((m) => m.member_id === omarMemberId)
    record('L: Omar\'s total_visits in the admin summary is 1 (the visit from B)', omarSummary?.total_visits === 1, JSON.stringify(omarSummary))
    const adminSelfSummary = adminSummary.json?.by_member?.find((m) => m.member_id === adminMemberId)
    record('L: the admin\'s own total_visits in the summary is 2 (K1 + K2)', adminSelfSummary?.total_visits === 2, JSON.stringify(adminSelfSummary))
    record('L: the admin appears in the summary under his display_name', adminSelfSummary?.visitor_name === 'Mohamad Admin', JSON.stringify(adminSelfSummary))
    const projectSummary = adminSummary.json?.by_project?.find((p) => p.project_id === projectId)
    record('L: the project\'s total_visits in the admin summary is 4 (Ramadan + Omar + the admin twice)', projectSummary?.total_visits === 4, JSON.stringify(projectSummary))
    record(
      'L: the project\'s visitors list in the admin summary names all three distinct members',
      new Set((projectSummary?.visitors ?? []).map((v) => v.member_id)).size === 3,
      JSON.stringify(projectSummary?.visitors)
    )

    const employeeSummary = await employee.get(`/api/site-visits/summary?month=${month}`)
    record('L: employee can fetch the summary (200)', employeeSummary.status === 200, `status=${employeeSummary.status}`)
    record(
      'L: the employee\'s summary only ever names themselves',
      employeeSummary.json?.by_member?.length === 1 && employeeSummary.json.by_member[0].member_id === ramadanMemberId,
      JSON.stringify(employeeSummary.json?.by_member)
    )
    const employeeProjectSummary = employeeSummary.json?.by_project?.find((p) => p.project_id === projectId)
    record(
      'L: the employee\'s own per-project count only counts their own visits, not anyone else\'s',
      employeeProjectSummary?.total_visits === 1,
      JSON.stringify(employeeProjectSummary)
    )

    // ======================================================================
    // M: GET /api/site-visits/visitors - only valid visitors are offered, with resolved names and role;
    // an employee is refused
    // ======================================================================
    const visitorsRes = await admin.get('/api/site-visits/visitors')
    record('M: admin can fetch the visitors list (200)', visitorsRes.status === 200, `status=${visitorsRes.status}`)
    const visitorIds = (visitorsRes.json ?? []).map((v) => v.id)
    record('M: the visitors list includes the admin (no employee record) and both active staff', [adminMemberId, ramadanMemberId, omarMemberId].every((m) => visitorIds.includes(m)), JSON.stringify(visitorsRes.json))
    record('M: the visitors list excludes the site worker', !visitorIds.includes(siteWorkerMemberId), JSON.stringify(visitorIds))
    record('M: the visitors list excludes the inactive employee', !visitorIds.includes(inactiveMemberId), JSON.stringify(visitorIds))
    const adminVisitorEntry = (visitorsRes.json ?? []).find((v) => v.id === adminMemberId)
    record('M: the admin\'s entry in the visitors list carries his display_name and role', adminVisitorEntry?.name === 'Mohamad Admin' && adminVisitorEntry?.role === 'admin', JSON.stringify(adminVisitorEntry))

    const employeeVisitorsRes = await employee.get('/api/site-visits/visitors')
    record('M: an employee is refused the visitors list (403)', employeeVisitorsRes.status === 403, `status=${employeeVisitorsRes.status}`)

    // ======================================================================
    // N: an admin can edit and delete any visit in their company
    // ======================================================================
    const adminEdit = await admin.patch(`/api/site-visits/${omarVisitId}`, { project_id: projectId, visit_date: today, start_time: '13:00', end_time: '14:00' })
    record('N: admin can edit any visit in their company (200)', adminEdit.status === 200, `status=${adminEdit.status}`)
    const adminDelete = await admin.del(`/api/site-visits/${omarVisitId}`)
    record('N: admin can delete any visit in their company (200)', adminDelete.status === 200, `status=${adminDelete.status}`)

    // ======================================================================
    // O: company isolation - company A cannot see/edit company B's visits, and cannot use B's member or project
    // ======================================================================
    const visitForB = await db.query(
      `insert into site_visits (organization_id, member_id, project_id, visit_date, start_time, created_by)
       values ($1, $2, $3, $4, '09:00', (select id from app_users where email = $5)) returning id`,
      [orgIdB, staffBMemberId, projectIdB, today, B_EMAIL]
    )
    const visitForBId = id(visitForB.rows[0])

    const crossOrgGet = await admin.get(`/api/site-visits?month=${month}`)
    record(
      "O: company A's admin never sees company B's visit in their own list",
      !(crossOrgGet.json ?? []).some((v) => v.id === visitForBId),
      JSON.stringify((crossOrgGet.json ?? []).map((v) => v.id))
    )

    const crossOrgEdit = await admin.patch(`/api/site-visits/${visitForBId}`, { project_id: projectId, visit_date: today, start_time: '09:00' })
    record("O: company A's admin cannot edit company B's visit (404)", crossOrgEdit.status === 404, `status=${crossOrgEdit.status}`)

    const crossOrgDelete = await admin.del(`/api/site-visits/${visitForBId}`)
    record("O: company A's admin cannot delete company B's visit (404)", crossOrgDelete.status === 404, `status=${crossOrgDelete.status}`)

    const crossOrgMember = await admin.post('/api/site-visits', { member_id: staffBMemberId, project_id: projectId, visit_date: today, start_time: '09:00' })
    record("O: company A's admin cannot use company B's member_id (400, treated as not existing)", crossOrgMember.status === 400, `status=${crossOrgMember.status}`)

    const crossOrgProject = await admin.post('/api/site-visits', { member_id: ramadanMemberId, project_id: projectIdB, visit_date: today, start_time: '09:00' })
    record("O: company A's admin cannot use company B's project_id (400, treated as not existing)", crossOrgProject.status === 400, `status=${crossOrgProject.status}`)
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
  }
}

main()
  .catch((err) => {
    console.error('[site-visits] FATAL', err)
    process.exitCode = 1
  })
  .finally(() => {
    printReport()
    process.exit(process.exitCode ?? 0)
  })
