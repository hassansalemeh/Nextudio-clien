// Strict multi-tenant isolation test: zero production connection.
//
// Boots the real Express server (server/dist/app.js) against an in-memory PGlite database (same technique
// as run-ui-verification.cjs - see that file and its README for details), then drives the real HTTP API
// directly (no browser) as two separate companies and asserts that neither can see or touch the other's
// data. Nothing here ever touches DATABASE_URL from server/.env.
//
// Usage (from the repo root):
//   node server/tools/test-harness/run-isolation-tests.cjs
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
  console.log('[isolation]', ...args)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'PASS' : 'FAIL', '-', name, detail ? `(${detail})` : '')
}

function printReport() {
  log('')
  log('==== ISOLATION CHECKS ====')
  for (const r of results) log(r.ok ? 'PASS' : 'FAIL', '-', r.name, r.detail ? `(${r.detail})` : '')
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    log(`\n${failed.length} check(s) failed.`)
    process.exitCode = 1
  } else {
    log('\nAll isolation checks passed: every company only ever sees and touches its own data.')
  }
}

// ---- same scrypt scheme as server/src/modules/auth/auth.service.ts (kept in sync manually) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

// A tiny cookie-jar HTTP client, logged in as one company's admin.
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
    put: (p, body) => raw('PUT', p, body),
    del: (p) => raw('DELETE', p),
  }
}

async function main() {
  log('building server...')
  execSync('npm run build', { cwd: SERVER_DIR, stdio: 'inherit' })

  // ---- patch the exact `pg` module instance the compiled server will require (same technique as
  // run-ui-verification.cjs) ----
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

  // ---- seed two companies, each with its own admin login. "Isolation Test Co A" is a SECOND company
  // alongside the "Nextudio" row migration 20261025 already creates, so this also proves a brand-new
  // organization (not just the one every legacy row defaults to) is fully isolated. ----
  async function createCompanyAdmin(orgName, email, password) {
    const org = await db.query('insert into organizations (name) values ($1) returning id', [orgName])
    const orgId = org.rows[0].id
    const user = await db.query('insert into app_users (email, password_hash, role) values ($1, $2, $3) returning id', [
      email,
      hashPassword(password),
      'admin',
    ])
    await db.query('insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)', [orgId, user.rows[0].id, 'admin'])
    return orgId
  }

  const A_EMAIL = 'isolation-a-admin@nextudio.local'
  const A_PASSWORD = 'isolation-a-pw-12345'
  const B_EMAIL = 'isolation-b-admin@nextudio.local'
  const B_PASSWORD = 'isolation-b-pw-12345'
  await createCompanyAdmin('Isolation Test Co A', A_EMAIL, A_PASSWORD)
  await createCompanyAdmin('Isolation Test Co B', B_EMAIL, B_PASSWORD)
  log('seeded two companies, each with its own admin login')

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
    const a = makeClient(baseUrl)
    const b = makeClient(baseUrl)

    const loginA = await a.login(A_EMAIL, A_PASSWORD)
    record('company A admin logs in', loginA.status === 200, `status=${loginA.status}`)
    const loginB = await b.login(B_EMAIL, B_PASSWORD)
    record('company B admin logs in', loginB.status === 200, `status=${loginB.status}`)

    // ---- build out company A's data: client, employee, project, estimate -> approve (invoice + project),
    // payment, and a work assignment ----
    const todayIso = new Date().toISOString().slice(0, 10)

    const clientA = await a.post('/api/clients', { name: 'Company A Client', contact_name: null, email: null, phone: null, address: null })
    record('company A creates a client', clientA.status === 201, `status=${clientA.status}`)
    const clientIdA = clientA.json?.id

    const employeeA = await a.post('/api/employees', { full_name: 'Company A Employee', position: 'Architect', monthly_salary: 1000 })
    record('company A creates an employee', employeeA.status === 201, `status=${employeeA.status}`)
    const employeeIdA = employeeA.json?.id

    const projectA = await a.post('/api/projects', {
      client_id: clientIdA,
      name: 'Company A Project',
      status: 'planning',
      fee_status: 'pending',
    })
    record('company A creates a project', projectA.status === 201, `status=${projectA.status}`)
    const projectIdA = projectA.json?.id

    const estimateA = await a.post('/api/estimates', {
      estimate_date: todayIso,
      client_id: clientIdA,
      status: 'draft',
      items: [{ name: 'Design work', quantity: 1, unit: 'ls', unit_price: 1000 }],
    })
    record('company A creates an estimate', estimateA.status === 201, `status=${estimateA.status}`)
    const estimateIdA = estimateA.json?.id

    const approveA = await a.post(`/api/estimates/${estimateIdA}/approve`, {})
    record('company A approves its estimate (creates invoice + project)', approveA.status === 201, `status=${approveA.status}`)
    const invoiceIdA = approveA.json?.invoice_id
    const createdProjectIdA = approveA.json?.created_project_id

    // (not linked to invoiceIdA: a professional invoice created via estimate approval only carries the
    // REVERSE link, projects.source_invoice_id - its own invoices.project_id stays null by design, so
    // checkPayment's "this invoice belongs to this project" check would reject it regardless of tenancy;
    // that is an existing, unrelated behavior and not what this test is checking)
    const paymentA = await a.post('/api/payments', {
      project_id: createdProjectIdA,
      payment_date: todayIso,
      amount: 100,
      reason: 'Down payment',
    })
    record('company A records a payment', paymentA.status === 201, `status=${paymentA.status}`)
    const paymentIdA = paymentA.json?.id

    const clientFundsA = await a.post('/api/invoices', {
      invoice_type: 'client_funds',
      client_id: clientIdA,
      project_id: projectIdA,
      invoice_date: todayIso,
      items: [{ name: 'Material purchase', quantity: 1, unit: 'ls', unit_price: 200 }],
    })
    record('company A creates a Client Funds invoice', clientFundsA.status === 201, `status=${clientFundsA.status}`)
    const clientFundsInvoiceIdA = clientFundsA.json?.id

    const disbursementA = await a.post(`/api/invoices/${clientFundsInvoiceIdA}/disbursements`, {
      disbursement_date: todayIso,
      payee: 'Supplier A',
      amount: 50,
    })
    record('company A records a disbursement', disbursementA.status === 201, `status=${disbursementA.status}`)

    const assignmentA = await a.post(`/api/projects/${projectIdA}/assignments`, { employee_id: employeeIdA })
    record('company A assigns its employee to its project', assignmentA.status === 201, `status=${assignmentA.status}`)

    // ======================================================================
    // Build out company B's data the same way
    // ======================================================================
    const clientB = await b.post('/api/clients', { name: 'Company B Client', contact_name: null, email: null, phone: null, address: null })
    const clientIdB = clientB.json?.id
    const employeeB = await b.post('/api/employees', { full_name: 'Company B Employee', position: 'Architect', monthly_salary: 1000 })
    const employeeIdB = employeeB.json?.id
    const projectB = await b.post('/api/projects', { client_id: clientIdB, name: 'Company B Project', status: 'planning', fee_status: 'pending' })
    const projectIdB = projectB.json?.id
    const estimateB = await b.post('/api/estimates', {
      estimate_date: todayIso,
      client_id: clientIdB,
      status: 'draft',
      items: [{ name: 'Design work', quantity: 1, unit: 'ls', unit_price: 1000 }],
    })
    const estimateIdB = estimateB.json?.id
    const approveB = await b.post(`/api/estimates/${estimateIdB}/approve`, {})
    const invoiceIdB = approveB.json?.invoice_id
    const createdProjectIdB = approveB.json?.created_project_id
    const paymentB = await b.post('/api/payments', {
      project_id: createdProjectIdB,
      payment_date: todayIso,
      amount: 100,
      reason: 'Down payment',
    })
    const paymentIdB = paymentB.json?.id
    record(
      'company B builds its own client/employee/project/estimate/invoice/payment',
      [clientB, employeeB, projectB, estimateB, approveB, paymentB].every((r) => r.status === 201),
      'all 201'
    )

    // ======================================================================
    // Logged in as B: every list endpoint shows only B's data
    // ======================================================================
    const listChecks = [
      ['clients', '/api/clients', (rows) => rows.every((r) => r.name !== 'Company A Client') && rows.some((r) => r.name === 'Company B Client')],
      ['employees', '/api/employees', (rows) => rows.every((r) => r.full_name !== 'Company A Employee') && rows.some((r) => r.full_name === 'Company B Employee')],
      ['projects', '/api/projects', (rows) => rows.every((r) => r.name !== 'Company A Project') && rows.some((r) => r.name === 'Company B Project')],
      ['estimates (approved estimates leave the open list, so just checking A never appears)', '/api/estimates', (rows) => rows.every((r) => String(r.id) !== String(estimateIdA))],
      ['invoices', '/api/invoices', (rows) => rows.every((r) => String(r.id) !== String(invoiceIdA) && String(r.id) !== String(clientFundsInvoiceIdA))],
      ['payments', '/api/payments', (rows) => rows.every((r) => String(r.id) !== String(paymentIdA))],
      ['project-financial-summary', '/api/project-financial-summary', (rows) => rows.every((r) => String(r.project_id) !== String(createdProjectIdA))],
      ['pending-work-entries', '/api/pending-work-entries', (rows) => Array.isArray(rows)],
    ]
    for (const [label, route, predicate] of listChecks) {
      const res = await b.get(route)
      const ok = res.status === 200 && Array.isArray(res.json) && predicate(res.json)
      record(`company B's "${label}" list shows only its own data`, ok, `status=${res.status} count=${Array.isArray(res.json) ? res.json.length : 'n/a'}`)
    }

    const dashboardB = await b.get('/api/dashboard')
    const dashboardOkB =
      dashboardB.status === 200 && Array.isArray(dashboardB.json?.projects) && dashboardB.json.projects.every((p) => String(p.project_id) !== String(createdProjectIdA))
    record("company B's dashboard shows only its own project", dashboardOkB, `status=${dashboardB.status}`)

    // ======================================================================
    // Logged in as B: every id-based endpoint rejects company A's ids as 404, and changes nothing
    // ======================================================================
    const idChecks = [
      ['GET client by editing it with a bad id (PUT)', () => b.put(`/api/clients/${clientIdA}`, { name: 'tampered' })],
      ['GET project', () => b.get(`/api/projects/${projectIdA}`)],
      ['PUT project', () => b.put(`/api/projects/${projectIdA}`, { client_id: clientIdB, name: 'tampered', status: 'planning', fee_status: 'pending' })],
      ['DELETE project', () => b.del(`/api/projects/${projectIdA}`)],
      ['GET estimate', () => b.get(`/api/estimates/${estimateIdA}`)],
      ['DELETE estimate', () => b.del(`/api/estimates/${estimateIdA}`)],
      ['GET invoice', () => b.get(`/api/invoices/${invoiceIdA}`)],
      ['PUT client funds invoice', () => b.put(`/api/invoices/${clientFundsInvoiceIdA}`, { client_id: clientIdB, project_id: projectIdB, invoice_date: todayIso, items: [] })],
      ['GET invoice emails', () => b.get(`/api/invoices/${invoiceIdA}/emails`)],
      ['GET estimate emails', () => b.get(`/api/estimates/${estimateIdA}/emails`)],
      ['POST estimate send-email', () => b.post(`/api/estimates/${estimateIdA}/send-email`, {})],
      ['POST invoice send-email', () => b.post(`/api/invoices/${invoiceIdA}/send-email`, {})],
      ['GET estimate PDF', () => b.get(`/api/estimates/${estimateIdA}/pdf`)],
      ['GET invoice PDF', () => b.get(`/api/invoices/${invoiceIdA}/pdf`)],
      ['GET disbursements', () => b.get(`/api/invoices/${clientFundsInvoiceIdA}/disbursements`)],
      ['PUT payment', () => b.put(`/api/payments/${paymentIdA}`, { project_id: projectIdB, payment_date: todayIso, amount: 1, reason: 'tampered' })],
    ]
    for (const [label, call] of idChecks) {
      const res = await call()
      record(`company B using A's id - ${label} - returns 404`, res.status === 404, `status=${res.status}`)
    }

    // Relationship-creation endpoints in this codebase already treat an unrelated foreign id as 400
    // "does not exist" rather than a 404 on the URL's own resource (the same way POST /api/projects
    // treats a bad client_id) - cross-tenant behaves exactly the same way: company A's project id is, from
    // company B's point of view, simply a project that does not exist.
    const assignOntoA = await b.post(`/api/projects/${projectIdA}/assignments`, { employee_id: employeeIdB })
    record("company B using A's project id - POST assignment - rejected as not existing", assignOntoA.status === 400, `status=${assignOntoA.status}`)

    // A sub-list scoped by a parent id that isn't B's returns an empty list, not a 404 - still "only its
    // own data" (here: none), the same way GET /api/payments?project_id=<A's id> would.
    const assignmentsForA = await b.get(`/api/projects/${projectIdA}/assignments`)
    record(
      "company B listing assignments for A's project sees none",
      assignmentsForA.status === 200 && Array.isArray(assignmentsForA.json) && assignmentsForA.json.length === 0,
      `status=${assignmentsForA.status} count=${Array.isArray(assignmentsForA.json) ? assignmentsForA.json.length : 'n/a'}`
    )

    // ---- and company A's data is completely unchanged after all of B's attempts ----
    const projectAAfter = await a.get(`/api/projects/${projectIdA}`)
    record("company A's project is unchanged after B's tampering attempts", projectAAfter.status === 200 && projectAAfter.json.project.name === 'Company A Project')

    const clientsAAfter = await a.get('/api/clients')
    record(
      "company A's client is unchanged after B's tampering attempts",
      clientsAAfter.json.some((c) => String(c.id) === String(clientIdA) && c.name === 'Company A Client')
    )

    const paymentsAAfter = await a.get('/api/payments')
    record(
      "company A's payment is unchanged after B's tampering attempts",
      paymentsAAfter.json.some((p) => String(p.id) === String(paymentIdA) && Number(p.amount) === 100 && p.reason === 'Down payment')
    )

    // ======================================================================
    // Company A still sees and does everything exactly as before
    // ======================================================================
    const projectsA = await a.get('/api/projects')
    record('company A still lists its own projects', projectsA.status === 200 && projectsA.json.some((p) => String(p.id) === String(projectIdA)))

    const invoiceDetailA = await a.get(`/api/invoices/${invoiceIdA}`)
    record('company A can still read its own invoice', invoiceDetailA.status === 200)

    const newPaymentA = await a.post('/api/payments', {
      project_id: createdProjectIdA,
      payment_date: todayIso,
      amount: 10,
      reason: 'Second payment, after B\'s tampering attempts',
    })
    record("company A can still record a new payment on its own project", newPaymentA.status === 201, `status=${newPaymentA.status}`)

    // ======================================================================
    // Concurrency: several admins of the SAME company creating estimates / Client Funds invoices at the
    // same moment must never collide on a number, and none of them should error. Uses a third, fresh
    // company so this doesn't interact with A's or B's existing numbers.
    // ======================================================================
    const c = makeClient(baseUrl)
    const C_EMAIL = 'isolation-c-admin@nextudio.local'
    const C_PASSWORD = 'isolation-c-pw-12345'
    await createCompanyAdmin('Isolation Test Co C', C_EMAIL, C_PASSWORD)
    await c.login(C_EMAIL, C_PASSWORD)

    const clientC = await c.post('/api/clients', { name: 'Company C Client', contact_name: null, email: null, phone: null, address: null })
    const clientIdC = clientC.json?.id
    const projectC = await c.post('/api/projects', { client_id: clientIdC, name: 'Company C Project', status: 'planning', fee_status: 'pending' })
    const projectIdC = projectC.json?.id

    const PARALLEL_COUNT = 8

    const concurrentEstimates = await Promise.all(
      Array.from({ length: PARALLEL_COUNT }, () =>
        c.post('/api/estimates', {
          estimate_date: todayIso,
          client_id: clientIdC,
          status: 'draft',
          items: [{ name: 'Design work', quantity: 1, unit: 'ls', unit_price: 1000 }],
        })
      )
    )
    const estimateNumbersC = concurrentEstimates.map((r) => r.json?.estimate_number)
    record(
      `${PARALLEL_COUNT} estimates created at once for the same company all succeed`,
      concurrentEstimates.every((r) => r.status === 201),
      `statuses=${concurrentEstimates.map((r) => r.status).join(',')}`
    )
    record(
      `${PARALLEL_COUNT} estimates created at once for the same company all get unique numbers`,
      new Set(estimateNumbersC).size === PARALLEL_COUNT,
      `numbers=${estimateNumbersC.join(',')}`
    )

    const concurrentInvoices = await Promise.all(
      Array.from({ length: PARALLEL_COUNT }, () =>
        c.post('/api/invoices', {
          invoice_type: 'client_funds',
          client_id: clientIdC,
          project_id: projectIdC,
          invoice_date: todayIso,
          items: [{ name: 'Material purchase', quantity: 1, unit: 'ls', unit_price: 100 }],
        })
      )
    )
    const invoiceNumbersC = concurrentInvoices.map((r) => r.json?.invoice_number)
    record(
      `${PARALLEL_COUNT} Client Funds invoices created at once for the same company all succeed`,
      concurrentInvoices.every((r) => r.status === 201),
      `statuses=${concurrentInvoices.map((r) => r.status).join(',')}`
    )
    record(
      `${PARALLEL_COUNT} Client Funds invoices created at once for the same company all get unique numbers`,
      new Set(invoiceNumbersC).size === PARALLEL_COUNT,
      `numbers=${invoiceNumbersC.join(',')}`
    )

    // And approving several different estimates of the same company at once must never collide on an
    // invoice number either (a separate numbering series and code path from the Client Funds one above).
    const moreEstimates = await Promise.all(
      Array.from({ length: PARALLEL_COUNT }, () =>
        c.post('/api/estimates', {
          estimate_date: todayIso,
          client_id: clientIdC,
          status: 'draft',
          items: [{ name: 'Design work', quantity: 1, unit: 'ls', unit_price: 1000 }],
        })
      )
    )
    const concurrentApprovals = await Promise.all(moreEstimates.map((r) => c.post(`/api/estimates/${r.json?.id}/approve`, {})))
    const approvalInvoiceNumbers = concurrentApprovals.map((r) => r.json?.invoice_number)
    record(
      `${PARALLEL_COUNT} estimates of the same company approved at once all succeed`,
      concurrentApprovals.every((r) => r.status === 201),
      `statuses=${concurrentApprovals.map((r) => r.status).join(',')}`
    )
    record(
      `${PARALLEL_COUNT} estimates of the same company approved at once all get unique invoice numbers`,
      new Set(approvalInvoiceNumbers).size === PARALLEL_COUNT,
      `numbers=${approvalInvoiceNumbers.join(',')}`
    )
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
  }
}

main()
  .catch((err) => {
    console.error('[isolation] FATAL', err)
    process.exitCode = 1
  })
  .finally(() => {
    printReport()
    process.exit(process.exitCode ?? 0)
  })
