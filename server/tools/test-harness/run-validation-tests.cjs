// Input-validation fuzz test: zero production connection.
//
// Boots the real Express server (server/dist/app.js) against an in-memory PGlite database (same technique
// as run-role-tests.cjs - see that file for details), logs in as an admin, discovers every POST, PUT and
// PATCH /api route automatically with listApiRoutes (so a brand-new route can never be left out of this test
// by accident), and sends each one deliberately invalid bodies: an empty body, and a "kitchen sink" body that
// gives every common field name a wrong type, a very long string, a bogus id, or a bad date, plus one field
// name no schema declares at all. Every one of these must come back 400 - never 500, since a 500 means some
// input reached code that assumed it was already valid.
//
// It also checks the opposite: text containing <script> is accepted and stored completely unchanged, as
// plain text - validation rejects bad shapes, it does not rewrite the content of a field that is otherwise fine.
//
// Usage (from the repo root):
//   node server/tools/test-harness/run-validation-tests.cjs
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
  console.log('[validation]', ...args)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'PASS' : 'FAIL', '-', name, detail ? `(${detail})` : '')
}

function printReport() {
  log('')
  log('==== VALIDATION CHECKS ====')
  for (const r of results) log(r.ok ? 'PASS' : 'FAIL', '-', r.name, r.detail ? `(${r.detail})` : '')
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    log(`\n${failed.length} check(s) failed.`)
    process.exitCode = 1
  } else {
    log('\nAll validation checks passed: every route rejects bad input with 400, never a 500, and good text (even with <script> in it) is stored unchanged.')
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

// Routes this fuzz test must never touch: logging out would invalidate the session the rest of the sweep
// relies on, and it reads no body anyway, so there's nothing here for it to validate.
const SKIP_ROUTES = new Set(['POST /api/auth/logout'])

// Routes that read no body at all (an approval/duplicate action, or a dry-run preview) - there is nothing
// here for validate() to reject, so a garbage body is harmless by design and must not be expected to 400.
// Still checked for the one thing that always matters: it must never answer with a 500.
const NO_BODY_ROUTES = new Set([
  'POST /api/estimates/:estimateId/approve',
  'POST /api/estimates/:estimateId/duplicate',
  'POST /api/reminders/preview',
])

// Routes whose body schema makes every field optional, by design (see their .schemas.ts for why) - an empty
// body is genuinely valid input here, so it sails through validation and then 404s on this test's made-up id
// (1) instead of 400. The "wrong types / bogus ids / bad dates / overlong strings" body below still must 400
// on these like everywhere else.
const EMPTY_BODY_MAY_BE_VALID_ROUTES = new Set(['PUT /api/invoices/:invoiceId/contract', 'POST /api/pending-work-entries/:id/approve'])

// This route checks "is this entry still pending" before the body is even looked at (see
// pending-work.routes.ts), and seeding a real pending entry needs a whole employee + clock-in + manual-entry
// flow that is out of scope for this sweep - so it always 404s here, on both bodies, same as on an empty one.
const KITCHEN_SINK_MAY_404_ROUTES = new Set(['POST /api/pending-work-entries/:id/approve'])

// Every common field name across every module's schema, each given a value that should fail that field's
// validation no matter which module reads it: a wrong type, a bogus id, a bad date, or a very long string.
// Any field name a given route's schema doesn't declare is simply dropped by validate() ("unknown fields
// removed"); what matters is that whichever fields a schema DOES declare come back wrong, every time.
const LONG_STRING = 'x'.repeat(5000)
const KITCHEN_SINK_BODY = {
  // text fields: a wrong type for some, a very long string for others - both are "invalid" shapes
  name: 12345,
  full_name: 12345,
  display_name: LONG_STRING,
  contact_name: LONG_STRING,
  recipient_name: LONG_STRING,
  receiver_name: LONG_STRING,
  payee: LONG_STRING,
  position: LONG_STRING,
  title: LONG_STRING,
  subject: LONG_STRING,
  reason: LONG_STRING,
  description: 12345,
  body: 12345,
  introduction: 12345,
  notes: 12345,
  payment_terms: 12345,
  timeline: 12345,
  exclusions: 12345,
  summary: 12345,
  project_location: LONG_STRING,
  customer_ref: LONG_STRING,
  issued_by_admin: 12345,
  contract_terms: 12345,
  client_representative_name: LONG_STRING,
  client_representative_title: LONG_STRING,
  nextudio_representative_name: LONG_STRING,
  nextudio_representative_title: LONG_STRING,
  method: 12345,
  reference: LONG_STRING,
  receipt_number: LONG_STRING,
  estimate_number: LONG_STRING,
  invoice_number: LONG_STRING,
  letter_number: LONG_STRING,
  // emails
  email: 12345,
  contact_email: 'not-an-email',
  receiver_email: 'not-an-email',
  testEmail: 'not-an-email',
  to: 'not-an-email',
  cc: 12345,
  password: 12345,
  // ids: syntactically wrong (not a positive integer string)
  client_id: 'not-an-id!!',
  project_id: 'not-an-id!!',
  employee_id: 'not-an-id!!',
  invoice_id: 'not-an-id!!',
  payment_id: 'not-an-id!!',
  issued_by_signer_id: 'not-an-id!!',
  received_by_signer_id: 'not-an-id!!',
  // numbers given strings instead
  amount: 'not-a-number',
  unit_price: 'not-a-number',
  quantity: 'not-a-number',
  monthly_salary: 'not-a-number',
  hourly_rate: 'not-a-number',
  total_fee: 'not-a-number',
  discount_value: 'not-a-number',
  lump_sum_fee: 'not-a-number',
  // dates given a string that isn't one
  start_date: 'not-a-date',
  end_date: 'not-a-date',
  due_date: 'not-a-date',
  valid_until: 'not-a-date',
  estimate_date: 'not-a-date',
  invoice_date: 'not-a-date',
  receipt_date: 'not-a-date',
  letter_date: 'not-a-date',
  payment_date: 'not-a-date',
  disbursement_date: 'not-a-date',
  work_date: 'not-a-date',
  date: 'not-a-date',
  from: 12345,
  start: 12345,
  end: 12345,
  day_start: 12345,
  day_end: 12345,
  start_time: 12345,
  end_time: 12345,
  // enums/options given a value outside the allowed set
  status: 'not-a-real-status',
  fee_status: 'not-a-real-status',
  pricing_method: 'not-a-real-method',
  discount_type: 'not-a-real-type',
  currency: 'not-a-currency',
  document_language: 'not-a-language',
  unit: 'not-a-unit',
  kind: 'not-a-kind',
  invoice_type: 'not-client-funds',
  // other wrong types
  items: 'not-an-array',
  mime_type: 'image/not-a-real-type',
  image_base64: 12345,
  is_active: 'not-a-boolean',
  is_paid: 'not-a-boolean',
  show_paid_stamp: 'not-a-boolean',
  show_company_stamp: 'not-a-boolean',
  attach_pdf: 'not-a-boolean',
  // a field name no schema anywhere declares - must be silently dropped, not cause a crash
  zz_totally_unrecognized_field_name: 'anything',
}

async function main() {
  log('building server...')
  execSync('npm run build', { cwd: SERVER_DIR, stdio: 'inherit' })

  // ---- patch the exact `pg` module instance the compiled server will require (same technique as
  // run-isolation-tests.cjs / run-role-tests.cjs) ----
  const pgEntry = require.resolve('pg', { paths: [SERVER_DIR] })
  const { Pool } = require(pgEntry)
  const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [SERVER_DIR] }))
  const { btree_gist } = require(require.resolve('@electric-sql/pglite/contrib/btree_gist', { paths: [SERVER_DIR] }))

  const db = new PGlite({ extensions: { btree_gist } })
  await db.waitReady

  const PG_BIGINT_OID = 20

  // 'rowMode'/'array' here is Prisma's @prisma/adapter-pg talking to this Pool - see
  // server/tools/test-harness/README.md and the TECH-06 PR description for why this shim now
  // forwards rowMode to PGlite and gives the fake client EventEmitter no-ops (interactive
  // transactions call conn.on('error', ...)). Plain object-mode queries (the app's own pool.query
  // calls, and everything below that doesn't set rowMode) behave exactly as before.
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

  // ---- seed one company with one admin ----
  const org = await db.query("insert into organizations (name) values ('Validation Test Co') returning id")
  const orgId = org.rows[0].id

  const ADMIN_EMAIL = 'validation-test-admin@nextudio.local'
  const ADMIN_PASSWORD = 'validation-test-admin-pw-12345'
  const adminUser = await db.query('insert into app_users (email, password_hash, role) values ($1, $2, $3) returning id', [
    ADMIN_EMAIL,
    hashPassword(ADMIN_PASSWORD),
    'admin',
  ])
  await db.query('insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)', [orgId, adminUser.rows[0].id, 'admin'])
  log('seeded one company with one admin login')

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
    const client = makeClient(baseUrl)
    const login = await client.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    record('admin logs in', login.status === 200, `status=${login.status}`)

    // ---- seed one real record of each kind, through the real (now-validated) API, so the routes that check
    // "does this id belong to this company" BEFORE looking at the body (send-email, disbursements - see their
    // *.routes.ts) can actually be reached far enough to exercise their body validation, instead of always
    // 404ing on a made-up id first. A plain "1" is still used for every other :id-shaped path segment.
    const today = new Date().toISOString().slice(0, 10)
    const clientRes = await client.call('POST', '/api/clients', { name: 'Validation Test Client' })
    const seededClientId = clientRes.json?.id
    const projectRes = await client.call('POST', '/api/projects', {
      client_id: seededClientId,
      name: 'Validation Test Project',
      status: 'in_progress',
      fee_status: 'pending',
    })
    const seededProjectId = projectRes.json?.id
    const estimateRes = await client.call('POST', '/api/estimates', {
      client_id: seededClientId,
      estimate_date: today,
      items: [{ name: 'Design', quantity: 1, unit: 'ls', unit_price: 100 }],
    })
    const seededEstimateId = estimateRes.json?.id
    await client.call('POST', `/api/estimates/${seededEstimateId}/approve`, {})
    const invoicesList = (await client.call('GET', '/api/invoices')).json ?? []
    const seededProfessionalInvoiceId = invoicesList.find((i) => i.invoice_type === 'professional_services')?.id
    const clientFundsInvoiceRes = await client.call('POST', '/api/invoices', {
      invoice_type: 'client_funds',
      client_id: seededClientId,
      project_id: seededProjectId,
      invoice_date: today,
      items: [{ name: 'Materials', quantity: 1, unit: 'ls', unit_price: 50 }],
    })
    const seededClientFundsInvoiceId = clientFundsInvoiceRes.json?.id
    const { ADMIN_SIGNERS } = require(path.join(SERVER_DIR, 'dist', 'config', 'config.js'))
    const letterRes = await client.call('POST', '/api/letters', {
      letter_date: today,
      recipient_name: 'Validation Test Recipient',
      subject: 'Validation Test Subject',
      body: 'Validation test letter body.',
      issued_by_admin: ADMIN_SIGNERS[0],
    })
    const seededLetterId = letterRes.json?.id
    const signerRes = await client.call('POST', '/api/document-signers', { display_name: 'Validation Test Signer' })
    const seededSignerId = signerRes.json?.find?.((s) => s.display_name === 'Validation Test Signer')?.id
    const receiptRes = await client.call('POST', '/api/receipts', {
      receipt_date: today,
      project_id: seededProjectId,
      receiver_name: 'Validation Test Payer',
      amount: 25,
      reason: 'Validation test receipt',
      issued_by_signer_id: seededSignerId,
      received_by_signer_id: seededSignerId,
    })
    const seededReceiptId = receiptRes.json?.id
    const employeeRes = await client.call('POST', '/api/employees', {
      full_name: 'Validation Test Employee',
      position: 'Architect',
      monthly_salary: 1000,
    })
    const seededEmployeeId = employeeRes.json?.id
    record(
      'seeded one real client/project/estimate(+approval)/invoice/letter/receipt/employee through the API for the body-validation sweep below',
      Boolean(
        seededClientId && seededProjectId && seededEstimateId && seededProfessionalInvoiceId && seededClientFundsInvoiceId && seededLetterId && seededReceiptId && seededEmployeeId
      ),
      `client=${seededClientId} project=${seededProjectId} estimate=${seededEstimateId} proInvoice=${seededProfessionalInvoiceId} cfInvoice=${seededClientFundsInvoiceId} letter=${seededLetterId} receipt=${seededReceiptId} employee=${seededEmployeeId}`
    )

    // A real id for the id-shaped path segments these specific routes need to get past their own
    // "does this belong to this company" check before the body under test is even looked at.
    const REAL_ID_BY_PARAM_FOR_ROUTE = {
      'POST /api/estimates/:estimateId/send-email': { estimateId: seededEstimateId },
      'POST /api/invoices/:invoiceId/send-email': { invoiceId: seededProfessionalInvoiceId },
      'POST /api/letters/:letterId/send-email': { letterId: seededLetterId },
      'POST /api/receipts/:receiptId/send-email': { receiptId: seededReceiptId },
      'POST /api/invoices/:invoiceId/disbursements': { invoiceId: seededClientFundsInvoiceId },
      'PUT /api/invoices/:invoiceId/contract': { invoiceId: seededProfessionalInvoiceId },
    }

    const allRoutes = listApiRoutes(app)
    const routes = allRoutes
      .filter((r) => ['POST', 'PUT', 'PATCH'].includes(r.method))
      .filter((r) => !SKIP_ROUTES.has(`${r.method} ${r.path}`))
    record('every POST/PUT/PATCH /api route was discovered automatically from the running app', routes.length > 0, `found ${routes.length} routes`)

    // Concrete, syntactically-plausible value for every path param - a real seeded id where this route needs
    // one to get past its own ownership check (see REAL_ID_BY_PARAM_FOR_ROUTE above), "1" everywhere else,
    // since the body is what's under test and the exact value of any other param never matters.
    function concretePath(routePath, key) {
      const overrides = REAL_ID_BY_PARAM_FOR_ROUTE[key] ?? {}
      return routePath.replace(/:([^/]+)/g, (_match, name) => String(overrides[name] ?? '1'))
    }

    for (const route of routes) {
      const key = `${route.method} ${route.path}`
      const url = concretePath(route.path, key)
      const noBody = NO_BODY_ROUTES.has(key)
      const emptyMayBeValid = EMPTY_BODY_MAY_BE_VALID_ROUTES.has(key)

      const emptyRes = await client.call(route.method, url, {})
      if (noBody) {
        record(`${key} never answers a body with 500 (it reads no body at all)`, emptyRes.status !== 500, `status=${emptyRes.status}`)
      } else if (emptyMayBeValid) {
        record(`${key} never 500s on an empty body (every field is optional by design)`, emptyRes.status !== 500, `status=${emptyRes.status}`)
      } else {
        record(`${key} rejects an empty body with 400, never 500`, emptyRes.status === 400, `status=${emptyRes.status}`)
      }

      const sinkRes = await client.call(route.method, url, KITCHEN_SINK_BODY)
      if (noBody) {
        record(`${key} never answers a body with 500 (it reads no body at all), take 2`, sinkRes.status !== 500, `status=${sinkRes.status}`)
      } else if (KITCHEN_SINK_MAY_404_ROUTES.has(key)) {
        record(`${key} never 500s on a garbage body (no seeded resource to validate it against)`, sinkRes.status !== 500, `status=${sinkRes.status}`)
      } else {
        record(
          `${key} rejects wrong types/bogus ids/bad dates/overlong strings with 400, never 500`,
          sinkRes.status === 400,
          `status=${sinkRes.status}`
        )
      }
    }

    // ---- updating an employee without saying which kind they already are must 400, not silently default
    // to 'staff' (unlike creating one, where defaulting to 'staff' is fine - see employees.schemas.ts) ----
    const updateMissingKind = await client.call('PUT', `/api/employees/${seededEmployeeId}`, {
      full_name: 'Validation Test Employee',
      position: 'Architect',
      monthly_salary: 1000,
      is_active: true,
    })
    record(
      'PUT /api/employees/:employeeId without kind is rejected with 400 (kind is required on update)',
      updateMissingKind.status === 400,
      `status=${updateMissingKind.status}`
    )

    // ---- the opposite check: a perfectly valid request with <script> in a text field is accepted, and the
    // text comes back completely unchanged - validation rejects bad shapes, it does not rewrite content ----
    const XSS_NAME = '<script>alert(1)</script> & "quoted" <b>bold</b>'
    const createRes = await client.call('POST', '/api/clients', { name: XSS_NAME })
    record('a client name containing <script> is accepted (status 201)', createRes.status === 201, `status=${createRes.status}`)
    record(
      'the <script> text comes back completely unchanged, as plain text',
      createRes.json?.name === XSS_NAME,
      `got=${JSON.stringify(createRes.json?.name)}`
    )
    if (createRes.json?.id) {
      const fetched = await db.query('select name from clients where id = $1', [createRes.json.id])
      record('the <script> text is stored in the database completely unchanged', fetched.rows[0]?.name === XSS_NAME, `stored=${JSON.stringify(fetched.rows[0]?.name)}`)
    }
  } finally {
    await new Promise((resolve) => httpServer.close(resolve))
  }
}

main()
  .catch((err) => {
    console.error('[validation] FATAL', err)
    process.exitCode = 1
  })
  .finally(() => {
    printReport()
    process.exit(process.exitCode ?? 0)
  })
