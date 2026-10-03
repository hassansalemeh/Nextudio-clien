// Isolated verification harness: zero production connection.
//
// Boots the real Express server (server/dist/app.js) against an in-memory PGlite database instead of the
// production Supabase Postgres, serves the real built client from server/public, and drives it with a
// real (headless) browser via playwright-core. Nothing here ever touches DATABASE_URL from server/.env.
// See README.md in this folder for details.
//
// Usage (from the repo root):
//   node server/tools/test-harness/run-ui-verification.cjs
//
// Requires: server/node_modules (pg, @electric-sql/pglite, playwright-core) and client/node_modules already
// installed (npm install in both), and a local Chromium-based browser (Edge or Chrome) on this machine.
//
// Cleans up after itself: closes the browser and the in-process server, and deletes server/public (the
// temporary built-client copy) so `git status` stays clean. The in-memory database is discarded with the
// process - nothing is written to disk. Screenshots are written to ./screenshots (git-ignored).

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const crypto = require('crypto')

const SERVER_DIR = path.resolve(__dirname, '..', '..')
const REPO_ROOT = path.resolve(SERVER_DIR, '..')
const CLIENT_DIR = path.join(REPO_ROOT, 'client')
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations')
const SERVER_PUBLIC_DIR = path.join(SERVER_DIR, 'public')
const CLIENT_DIST_DIR = path.join(CLIENT_DIR, 'dist')
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const ADMIN_EMAIL = 'ui-verify-admin@nextudio.local'
const ADMIN_PASSWORD = 'verify-admin-pw-12345'
const EMPLOYEE_EMAIL = 'ui-verify-employee@nextudio.local'
const EMPLOYEE_PASSWORD = 'verify-employee-pw-12345'

// Local calendar date, matching client/src/shared/lib/timeUtils.ts's localDateString() exactly - the app's
// clock-in/work-assignment logic is all local-date based, so a UTC .toISOString() date can be a full day off.
function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
const today = localDateString()

// Matching client/src/shared/lib/timeUtils.ts's addDays()/formatLongDate() exactly, for the duration-picker checks.
function addDaysLocal(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}
function formatLongDateLocal(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// ---- same scrypt scheme as server/src/modules/auth/auth.service.ts (kept in sync manually) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function log(...args) {
  console.log('[harness]', ...args)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'PASS' : 'FAIL', '-', name, detail ? `(${detail})` : '')
}

// One row per route, for the "route / role / result" report the run ends with.
const routeTable = []
function recordRoute(route, role, ok, detail) {
  routeTable.push({ route, role, ok, detail: detail ?? '' })
  log(ok ? 'PASS' : 'FAIL', '- route', route, `(${role})`, detail ? `- ${detail}` : '')
}

const consoleErrors = []

// Always printed, even when a step throws mid-run, so a failure still shows everything that passed before it.
function printReport() {
  log('')
  log('==== CHECKS ====')
  for (const r of results) log(r.ok ? 'PASS' : 'FAIL', '-', r.name, r.detail ? `(${r.detail})` : '')

  log('')
  log('==== ROUTE TABLE (route | role | result) ====')
  for (const r of routeTable) log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.route} | ${r.role} | ${r.detail}`)

  log('')
  log(`console errors captured: ${consoleErrors.length}`)
  for (const e of consoleErrors) log(`   [${e.route}] ${e.url}: ${e.text}`)

  const failedChecks = results.filter((r) => !r.ok)
  const failedRoutes = routeTable.filter((r) => !r.ok)
  if (failedChecks.length > 0 || failedRoutes.length > 0) {
    log(`\n${failedChecks.length} check(s) failed, ${failedRoutes.length} route(s) with console errors. See screenshots in ${SCREENSHOT_DIR}`)
    process.exitCode = 1
  } else {
    log('\nAll checks passed, every route rendered with no console errors.')
  }
}

async function main() {
  log('building server...')
  execSync('npm run build', { cwd: SERVER_DIR, stdio: 'inherit' })
  log('building client...')
  execSync('npm run build', { cwd: CLIENT_DIR, stdio: 'inherit' })

  fs.rmSync(SERVER_PUBLIC_DIR, { recursive: true, force: true })
  fs.cpSync(CLIENT_DIST_DIR, SERVER_PUBLIC_DIR, { recursive: true })
  log('copied client build into server/public')

  // ---- patch the exact `pg` module instance the compiled server will require ----
  const pgEntry = require.resolve('pg', { paths: [SERVER_DIR] })
  const { Pool } = require(pgEntry)

  const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [SERVER_DIR] }))
  const { btree_gist } = require(require.resolve('@electric-sql/pglite/contrib/btree_gist', { paths: [SERVER_DIR] }))

  const db = new PGlite({ extensions: { btree_gist } })
  await db.waitReady

  const PG_BIGINT_OID = 20 // int8

  async function adapterQuery(text, params) {
    if (text && typeof text === 'object') {
      params = text.values
      text = text.text
    }
    const result = await db.query(text, params ?? [])
    const fields = result.fields ?? []
    // node-postgres (what the real server uses) returns bigint/int8 columns as strings, never JS numbers,
    // to avoid silently losing precision above 2^53. PGlite returns them as numbers instead - stringify
    // here so every id/foreign key behaves exactly as it does against the real production database (this
    // matters: the client compares these ids against <select> values, which are always strings).
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

  // ---- load every migration, in order, exactly like Supabase would ----
  process.env.DATABASE_URL = 'postgres://pglite-fake-host/pglite' // never actually dialed; see the patch above
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of migrationFiles) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
  }
  log(`applied ${migrationFiles.length} migrations to the in-memory database`)

  // ---- seed exactly one admin login; everything else (clients, projects, the employee account) is created
  // through the real UI during the test, which is what's actually being verified ----
  await db.query('insert into app_users (email, password_hash, role) values ($1, $2, $3)', [
    ADMIN_EMAIL,
    hashPassword(ADMIN_PASSWORD),
    'admin',
  ])

  // ---- boot the real server (no NODE_ENV=production: plain http, non-secure cookies) ----
  const { app } = require(path.join(SERVER_DIR, 'dist', 'app.js'))
  const httpServer = await new Promise((resolve, reject) => {
    const s = app.listen(0, () => resolve(s))
    s.on('error', reject)
  })
  const port = httpServer.address().port
  const baseUrl = `http://localhost:${port}`
  log(`server listening on ${baseUrl}`)

  const executablePath = fs.existsSync(EDGE_PATH) ? EDGE_PATH : fs.existsSync(CHROME_PATH) ? CHROME_PATH : null
  if (!executablePath) throw new Error('No local Chromium-based browser found (checked Edge and Chrome default paths).')

  const { chromium } = require(require.resolve('playwright-core', { paths: [SERVER_DIR] }))
  const browser = await chromium.launch({ executablePath, headless: true })

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  let shot = 0
  async function screenshot(page, name) {
    shot += 1
    const file = path.join(SCREENSHOT_DIR, `${String(shot).padStart(2, '0')}-${name}.png`)
    await page.screenshot({ path: file })
    return file
  }

  // A card is identified by its own <h2>, since none of these forms have stable ids/test-ids.
  function cardByHeading(page, heading) {
    return page.locator('.card', { has: page.locator('h2', { hasText: heading }) })
  }

  // Console errors are attributed to whichever route was current when they fired, so the route table can
  // say "clean" or "console errors" per page instead of one global count.
  let currentRoute = '(pre-login)'
  function noteConsoleError(url, text) {
    consoleErrors.push({ route: currentRoute, url, text })
  }

  async function goToRoute(page, route, roleLabel, waitForText, { timeout = 10000 } = {}) {
    currentRoute = route
    const before = consoleErrors.length
    await page.waitForSelector(`text=${waitForText}`, { timeout })
    const newErrors = consoleErrors.slice(before)
    recordRoute(route, roleLabel, newErrors.length === 0, newErrors.length ? `${newErrors.length} console error(s)` : 'renders cleanly')
    return newErrors
  }

  try {
    const context = await browser.newContext()
    context.on('page', (p) => wireConsole(p))
    const page = await context.newPage()
    wireConsole(page)
    function wireConsole(p) {
      p.on('console', (msg) => {
        if (msg.type() === 'error') noteConsoleError(p.url(), msg.text())
      })
      p.on('pageerror', (err) => noteConsoleError(p.url(), err.message))
    }

    // ---- log in as admin ----
    await page.goto(baseUrl)
    await page.waitForSelector('text=Log in')
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await goToRoute(page, '/dashboard', 'admin', 'Confirmed Project Value')
    await screenshot(page, 'dashboard-after-login')
    record('admin login', true)

    // ---- slow every /api/ response so loading spinners are actually observable, like a throttled network ----
    await context.route('**/api/**', async (route) => {
      await new Promise((r) => setTimeout(r, 800))
      await route.continue()
    })

    // ======================================================================
    // Clients (empty state, create with double-submit guard)
    // ======================================================================
    await page.getByRole('link', { name: 'Clients', exact: true }).click()
    await page.waitForSelector('h1:has-text("Clients")')
    const clientsLoader = await page.locator('.page-loader').count().catch(() => 0)
    await goToRoute(page, '/clients', 'admin', 'No clients yet.')
    await screenshot(page, 'clients-empty-state')
    record('clients empty state renders', true, `page-loader seen: ${clientsLoader > 0}`)

    const clientFormHiddenByDefault = (await page.locator('#client-entry').count()) === 0
    await page.getByRole('button', { name: 'Add Client' }).click()
    await page.waitForSelector('#client-entry')
    record('add-client form hidden by default and opens on click', clientFormHiddenByDefault)

    await page.getByLabel('Client Name').fill('UI Verify Client')
    // Two raw DOM clicks dispatched in the same tick - a true double-click, faster than React can
    // re-render the `disabled` attribute. Proves the handler-level guard (useAsyncAction), not just the
    // visual disabled state.
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add Client')
      btn.click()
      btn.click()
    })
    await screenshot(page, 'clients-submitting')
    await page.waitForSelector('.toast-success', { timeout: 5000 })
    const clientToastText = await page.locator('.toast-success').first().innerText()
    await screenshot(page, 'clients-toast-success')
    record('client create success toast', clientToastText.includes('Client added'), clientToastText)

    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)
    const clientRows = await db.query("select count(*)::int as n from clients where name = 'UI Verify Client'")
    record('double-click created exactly one client', clientRows.rows[0].n === 1, `rows=${clientRows.rows[0].n}`)

    // ======================================================================
    // Projects (empty state, create two: one to assign/pay, one left unassigned for the pending-work test)
    // ======================================================================
    await page.getByRole('link', { name: 'Projects', exact: true }).click()
    await goToRoute(page, '/projects', 'admin', 'No projects yet.')
    await screenshot(page, 'projects-empty-state')
    record('projects empty state renders', true)

    const projectFormHiddenByDefault = (await page.locator('#project-entry').count()) === 0
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.waitForSelector('#project-entry')
    record('add-project form hidden by default and opens on click', projectFormHiddenByDefault)

    const addProjectCard = cardByHeading(page, 'Add Project')
    await addProjectCard.locator('select').first().selectOption({ label: 'UI Verify Client' })
    await addProjectCard.locator('input').first().fill('UI Verify Project')
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.waitForSelector('.toast-success')
    const projectToastText = await page.locator('.toast-success').first().innerText()
    await screenshot(page, 'projects-toast-success')
    record('project create success toast', projectToastText.includes('Project added'), projectToastText)
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)

    // The form closes itself on successful submit, so it has to be reopened for the second project.
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.waitForSelector('#project-entry')
    await addProjectCard.locator('select').first().selectOption({ label: 'UI Verify Client' })
    await addProjectCard.locator('input').first().fill('UI Verify Unassigned Project')
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.waitForSelector('.toast-success')
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)
    record('second project (left unassigned) created', true)

    // ---- Project detail page ----
    await page.getByRole('link', { name: 'UI Verify Project', exact: true }).click()
    await page.waitForSelector('h1:has-text("UI Verify Project")')
    const projectRow = await db.query("select id from projects where name = 'UI Verify Project'")
    await goToRoute(page, `/projects/${projectRow.rows[0].id}`, 'admin', 'Project Details')
    await screenshot(page, 'project-detail')
    await page.getByRole('link', { name: '← Back to Projects' }).click()
    await page.waitForSelector('h1:has-text("Projects")')

    // ======================================================================
    // Payments (empty state, record one against "UI Verify Project")
    // ======================================================================
    await page.getByRole('link', { name: 'Payments', exact: true }).click()
    await goToRoute(page, '/payments', 'admin', 'No payments recorded yet.')
    await screenshot(page, 'payments-empty-state')
    record('payments empty state renders', true)

    const paymentFormHiddenByDefault = (await page.locator('#payment-entry').count()) === 0
    await page.getByRole('button', { name: 'Add Payment' }).click()
    await page.waitForSelector('#payment-entry')
    record('add-payment form hidden by default and opens on click', paymentFormHiddenByDefault)

    await page.locator('form').locator('select').first().selectOption({ label: 'UI Verify Project' })
    await page.getByLabel('Amount Received').fill('500')
    await page.getByLabel('Reason / Description').fill('UI verify payment')
    await page.getByRole('button', { name: 'Add Payment' }).click()
    await page.waitForSelector('.toast-success')
    const paymentToastText = await page.locator('.toast-success').first().innerText()
    await screenshot(page, 'payments-toast-success')
    record('payment record success toast', paymentToastText.includes('Payment recorded'), paymentToastText)
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)

    // ======================================================================
    // Employees (empty state, error toast, create - gives the employee-role account its row)
    // ======================================================================
    await page.getByRole('link', { name: 'Employees', exact: true }).click()
    await goToRoute(page, '/employees', 'admin', 'No employees yet.')
    await screenshot(page, 'employees-empty-state')
    record('employees empty state renders', true)

    const employeeFormHiddenByDefault = (await page.locator('#employee-entry').count()) === 0
    await page.getByRole('button', { name: 'Add Employee' }).click()
    await page.waitForSelector('#employee-entry')
    record('add-employee form hidden by default and opens on click', employeeFormHiddenByDefault)

    // ---- error toast: abort the next create-employee request to simulate "server unreachable" ----
    await context.route('**/api/employees', (route) => route.abort('failed'), { times: 1 })
    await page.getByLabel('Full Name').fill('UI Verify Employee')
    await page.getByLabel('Position').fill('QA Tester')
    await page.getByLabel('Monthly Salary').fill('1000')
    await page.getByRole('button', { name: 'Add Employee' }).click()
    await page.waitForSelector('.toast-error', { timeout: 10000 })
    const errorToastText = await page.locator('.toast-error').first().innerText()
    await screenshot(page, 'employees-toast-error')
    record(
      "error toast shows the can't-reach-server message and stays",
      errorToastText.toLowerCase().includes("can't reach the server"),
      errorToastText
    )
    await page.waitForTimeout(5000)
    const errorToastStillThere = await page.locator('.toast-error').count()
    record('error toast does not auto-dismiss', errorToastStillThere > 0)
    await page.click('.toast-error .toast-dismiss')
    await page.waitForSelector('.toast-error', { state: 'detached', timeout: 3000 })
    record('error toast dismissible', true)

    // retry employee creation for real, to get an employee row for the role-based login check
    await page.getByRole('button', { name: 'Add Employee' }).click()
    await page.waitForSelector('.toast-success')
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)
    const employeeRow = await db.query("select id from employees where full_name = 'UI Verify Employee'")
    record('employee created', employeeRow.rows.length === 1)
    const employeeId = employeeRow.rows[0].id
    await db.query('insert into app_users (email, password_hash, role, employee_id) values ($1, $2, $3, $4)', [
      EMPLOYEE_EMAIL,
      hashPassword(EMPLOYEE_PASSWORD),
      'employee',
      employeeId,
    ])

    // ======================================================================
    // Assignments: team-assign the employee to "UI Verify Project", then give them a work assignment
    // covering today (so the employee session below can clock in and start work on it)
    // ======================================================================
    await page.getByRole('link', { name: 'Assignments', exact: true }).click()
    await page.waitForSelector('h1:has-text("Assignments")')
    const selectProjectCard = cardByHeading(page, 'Select Project')
    await selectProjectCard.locator('select').selectOption({ label: 'UI Verify Project' })
    await goToRoute(page, '/assignments', 'admin', 'Assigned Employees')
    await screenshot(page, 'assignments-project-selected')

    const assignedEmployeesCard = cardByHeading(page, 'Assigned Employees')
    await assignedEmployeesCard.locator('select').selectOption({ label: 'UI Verify Employee' })
    await assignedEmployeesCard.getByRole('button', { name: 'Assign' }).click()
    await page.waitForSelector('.toast-success')
    const teamToast = await page.locator('.toast-success').first().innerText()
    record('assign employee to project team success toast', teamToast.includes('assigned'), teamToast)
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)

    const assignWorkCard = cardByHeading(page, 'Assign Work')
    await assignWorkCard.locator('select').selectOption({ label: 'UI Verify Employee' })
    const dateInputs = assignWorkCard.locator('input[type="date"]')
    await dateInputs.nth(0).fill(today)
    await dateInputs.nth(1).fill(today)
    await assignWorkCard.locator('textarea').fill('UI verify task')
    await page.getByRole('button', { name: 'Assign Work' }).click()
    await page.waitForSelector('.toast-success')
    const workToast = await page.locator('.toast-success').first().innerText()
    await screenshot(page, 'assignments-work-assigned')
    record('create work assignment success toast', workToast.includes('Work assigned'), workToast)
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)

    // ======================================================================
    // Estimates: new -> pick client -> add item -> save -> preview
    // ======================================================================
    await page.getByRole('link', { name: 'Estimates', exact: true }).click()
    await goToRoute(page, '/estimates', 'admin', 'No open estimates')
    await page.getByRole('button', { name: 'New Estimate' }).first().click()
    await page.waitForSelector('text=New estimate')
    recordRoute('/estimates/new', 'admin', true, 'renders')

    await page.getByRole('button', { name: 'Add customer' }).click()
    await page.locator('.doc-customer-box select').selectOption({ label: 'UI Verify Client' })
    await page.getByRole('button', { name: 'Add item' }).click()
    await page.getByPlaceholder('Service (e.g. CD - Concept Design)').fill('UI Verify Service')
    await page.getByLabel('Unit price').fill('100')
    await page.getByRole('button', { name: 'Save and continue' }).first().click()
    await page.waitForSelector('.toast-success', { timeout: 10000 })
    const estimateToast = await page.locator('.toast-success').first().innerText()
    await screenshot(page, 'estimate-saved')
    record('estimate save success toast', estimateToast.includes('Estimate saved'), estimateToast)
    await page.waitForURL(/\/estimates\/\d+$/, { timeout: 10000 })
    const estimateId = page.url().match(/\/estimates\/(\d+)$/)[1]
    recordRoute(`/estimates/${estimateId}`, 'admin', true, 'saved and loaded')
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)

    // ---- Duration picker: new estimate defaults to 14 days, switching presets updates the shown date ----
    const estimateDateValue = await page.locator('#est-date').inputValue()
    const expected14 = addDaysLocal(estimateDateValue, 14)
    const fourteenPressed = await page.getByRole('button', { name: '14 days' }).getAttribute('aria-pressed')
    const hint14 = await page.locator('.duration-picker .doc-hint').first().innerText()
    record(
      'new estimate defaults "Valid until" to 14 days',
      fourteenPressed === 'true' && hint14.includes(formatLongDateLocal(expected14)),
      `hint="${hint14}"`
    )
    await page.locator('.duration-picker').scrollIntoViewIfNeeded()
    await screenshot(page, 'estimate-duration-picker')

    await page.getByRole('button', { name: '7 days' }).click()
    const expected7 = addDaysLocal(estimateDateValue, 7)
    const hint7 = await page.locator('.duration-picker .doc-hint').first().innerText()
    record('picking "7 days" shows the correct resulting date', hint7.includes(formatLongDateLocal(expected7)), `hint="${hint7}"`)

    await page.getByRole('button', { name: '30 days' }).click()
    const expected30 = addDaysLocal(estimateDateValue, 30)
    const hint30 = await page.locator('.duration-picker .doc-hint').first().innerText()
    record('picking "30 days" shows the correct resulting date', hint30.includes(formatLongDateLocal(expected30)), `hint="${hint30}"`)

    await page.getByRole('button', { name: 'Save and continue' }).first().click()
    await page.waitForSelector('.toast-success', { timeout: 10000 })
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)
    const savedAfter30 = await db.query("select to_char(valid_until, 'YYYY-MM-DD') as valid_until from estimates where id = $1", [estimateId])
    record(
      'new estimate with "30 days" picked saves the correct date',
      savedAfter30.rows[0].valid_until === expected30,
      `saved=${savedAfter30.rows[0].valid_until} expected=${expected30}`
    )

    await page.getByRole('button', { name: 'Preview', exact: true }).first().click()
    const previewErrorsBefore = consoleErrors.length
    await page.waitForSelector('iframe.doc-preview-frame', { timeout: 20000 })
    await page.waitForTimeout(1000) // let the PDF finish loading into the iframe
    await screenshot(page, 'estimate-preview')
    recordRoute(
      `/estimates/${estimateId}/preview`,
      'admin',
      consoleErrors.length === previewErrorsBefore,
      consoleErrors.length === previewErrorsBefore ? 'PDF rendered' : 'console error during PDF render'
    )
    // The preview page's own "Back" button returns to the editor (to keep editing), not to the list.
    await page.getByRole('button', { name: 'Back' }).click()
    await page.waitForSelector('h1:has-text("Edit estimate")')

    // ---- Duration picker: a saved date that isn't 7/14/30 days out shows as "Custom" and survives a save untouched ----
    const customValidUntil = addDaysLocal(estimateDateValue, 45)
    await db.query('update estimates set valid_until = $1 where id = $2', [customValidUntil, estimateId])
    await page.reload()
    await page.waitForSelector('h1:has-text("Edit estimate")')
    const customPillCount = await page.locator('.duration-option-custom').count()
    const presetActiveCount = await page.locator('.duration-option.active').count()
    record(
      'an estimate with a non-preset saved date shows "Custom" and no preset selected',
      customPillCount === 1 && presetActiveCount === 0
    )

    await page.getByRole('button', { name: 'Save and continue' }).first().click()
    await page.waitForSelector('.toast-success', { timeout: 10000 })
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)
    const afterCustomSave = await db.query("select to_char(valid_until, 'YYYY-MM-DD') as valid_until from estimates where id = $1", [estimateId])
    record(
      'opening and saving a "Custom" estimate does not change its date',
      afterCustomSave.rows[0].valid_until === customValidUntil,
      `before=${customValidUntil} after=${afterCustomSave.rows[0].valid_until}`
    )

    await page.getByRole('link', { name: 'Estimates', exact: true }).click()
    await page.waitForSelector('h1:has-text("Estimates")')

    // ======================================================================
    // Invoices: new Client Funds invoice -> detail -> add disbursement -> edit route -> preview route
    // ======================================================================
    await page.getByRole('link', { name: 'Invoices', exact: true }).click()
    await goToRoute(page, '/invoices', 'admin', 'No invoices yet')
    await page.getByRole('link', { name: 'New Client Funds Invoice' }).click()
    await page.waitForSelector('text=New Client Funds Invoice')
    recordRoute('/invoices/new', 'admin', true, 'renders')

    await page.getByRole('button', { name: 'Add client' }).click()
    await page.locator('.doc-customer-box select').selectOption({ label: 'UI Verify Client' })
    await page.locator('#cf-project').selectOption({ label: 'UI Verify Project' })
    await page.getByPlaceholder('e.g. Advance for construction workers, Material purchases, Supplier payment...').fill('UI Verify Funds Item')
    await page.getByLabel('Unit price').fill('200')

    // ---- Duration picker: new Client Funds invoice defaults "Payment due date" to 14 days ----
    const invoiceDateValue = await page.locator('#cf-date').inputValue()
    const expectedDue14 = addDaysLocal(invoiceDateValue, 14)
    const dueFourteenPressed = await page.getByRole('button', { name: '14 days' }).getAttribute('aria-pressed')
    const dueHint14 = await page.locator('.duration-picker .doc-hint').first().innerText()
    record(
      'new Client Funds invoice defaults "Payment due date" to 14 days',
      dueFourteenPressed === 'true' && dueHint14.includes(formatLongDateLocal(expectedDue14)),
      `hint="${dueHint14}"`
    )

    await page.getByRole('button', { name: 'Save and continue' }).first().click()
    await page.waitForSelector('.toast-success', { timeout: 10000 })
    const invoiceToast = await page.locator('.toast-success').first().innerText()
    await screenshot(page, 'invoice-saved')
    record('client funds invoice save success toast', invoiceToast.includes('Invoice saved'), invoiceToast)
    await page.waitForURL(/\/invoices\/\d+\/edit$/, { timeout: 10000 })
    const invoiceId = page.url().match(/\/invoices\/(\d+)\/edit$/)[1]
    recordRoute(`/invoices/${invoiceId}/edit`, 'admin', true, 'saved and loaded (new invoices land here)')
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)
    const savedDueDate = await db.query("select to_char(due_date, 'YYYY-MM-DD') as due_date from invoices where id = $1", [invoiceId])
    record(
      'new Client Funds invoice saves the correct default due date',
      savedDueDate.rows[0].due_date === expectedDue14,
      `saved=${savedDueDate.rows[0].due_date} expected=${expectedDue14}`
    )

    await page.getByRole('button', { name: 'View Invoice' }).first().click()
    await goToRoute(page, `/invoices/${invoiceId}`, 'admin', 'Disbursements')

    const disbursementForm = page.locator('form', { has: page.locator('h2', { hasText: 'Record Disbursement' }) })
    await disbursementForm.getByPlaceholder('e.g. ABC Contracting').fill('UI Verify Supplier')
    await disbursementForm.locator('input[type="number"]').fill('50')
    await disbursementForm.getByRole('button', { name: 'Record Disbursement' }).click()
    await page.waitForSelector('.toast-success', { timeout: 10000 })
    const disbursementToast = await page.locator('.toast-success').first().innerText()
    await screenshot(page, 'invoice-disbursement')
    record('disbursement record success toast', disbursementToast.includes('Disbursement recorded'), disbursementToast)
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)

    await page.getByRole('button', { name: 'Preview / PDF' }).click()
    const invoicePreviewErrorsBefore = consoleErrors.length
    await page.waitForSelector('iframe.doc-preview-frame', { timeout: 20000 })
    await page.waitForTimeout(1000)
    await screenshot(page, 'invoice-preview')
    recordRoute(
      `/invoices/${invoiceId}/preview`,
      'admin',
      consoleErrors.length === invoicePreviewErrorsBefore,
      consoleErrors.length === invoicePreviewErrorsBefore ? 'PDF rendered' : 'console error during PDF render'
    )

    // ======================================================================
    // Financial Summary: render check
    // ======================================================================
    await page.getByRole('link', { name: 'Financial Summary', exact: true }).click()
    await goToRoute(page, '/financial-summary', 'admin', 'All project figures')
    await screenshot(page, 'financial-summary')

    // ======================================================================
    // Switch to the employee role: My Tasks render, clock in/out, start/stop work, a pending work entry
    // ======================================================================
    await page.click('button:has-text("Log out")')
    await page.waitForSelector('text=Log in')
    await page.fill('input[type="email"]', EMPLOYEE_EMAIL)
    await page.fill('input[type="password"]', EMPLOYEE_PASSWORD)
    await page.click('button[type="submit"]')
    await goToRoute(page, '/ (My Tasks)', 'employee', 'My Tasks')
    await screenshot(page, 'employee-my-tasks')
    record('employee role logs in and sees My Tasks', true)

    await page.getByRole('button', { name: 'Clock In' }).click()
    await page.waitForSelector('text=Clocked in since')
    await screenshot(page, 'employee-clocked-in')
    record('employee clock in', true)

    await page.getByRole('button', { name: 'Start Work' }).click()
    await page.waitForSelector('text=Working on UI Verify Project')
    await screenshot(page, 'employee-working')
    record('employee starts work on assigned project', true)

    await page.getByRole('button', { name: 'Stop Work / Break' }).click()
    await page.waitForSelector('text=No project running')
    record('employee stops work', true)

    await page.getByRole('button', { name: 'Clock Out' }).click()
    await page.waitForSelector('text=You are not clocked in')
    await screenshot(page, 'employee-clocked-out')
    record('employee clock out', true)

    // ---- Add Work Manually against the UNASSIGNED project: this must land as a pending entry ----
    const manualCard = cardByHeading(page, 'Add Work Manually')
    // The server rejects manual entries that end in the future, so the window has to be relative to the
    // moment this actually runs - a fixed clock time would fail whenever the harness runs early enough in
    // the day. Two minutes ago to one minute ago is always in the past and (bar the ~00:00-00:02 edge case)
    // always still "today".
    const pad2 = (n) => String(n).padStart(2, '0')
    const fmtHHMM = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    const manualEnd = new Date(Date.now() - 60 * 1000)
    const manualStart = new Date(Date.now() - 2 * 60 * 1000)
    await manualCard.locator('select').selectOption({ label: 'UI Verify Unassigned Project' })
    await manualCard.locator('input[type="time"]').nth(0).fill(fmtHHMM(manualStart))
    await manualCard.locator('input[type="time"]').nth(1).fill(fmtHHMM(manualEnd))
    await manualCard.locator('textarea').fill('UI verify manual work on an unassigned project')
    await page.getByRole('button', { name: 'Add Work Entry' }).click()
    await page.waitForSelector('text=Submitted — waiting for admin approval.', { timeout: 10000 })
    await screenshot(page, 'employee-manual-entry-pending')
    record('manual work entry on unassigned project goes to pending', true)

    // ======================================================================
    // Back to admin: approve the pending entry, review hours, financial pages with real data
    // ======================================================================
    await page.click('button:has-text("Log out")')
    await page.waitForSelector('text=Log in')
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForSelector('text=Dashboard')

    await page.getByRole('link', { name: 'Approvals', exact: true }).click()
    await goToRoute(page, '/pending-work', 'admin', 'UI Verify Employee')
    await screenshot(page, 'pending-work-entry')
    await page.getByRole('button', { name: 'Approve & Assign' }).click()
    // The "Approve & Assign" panel pre-fills its dates from the entry's timestamp in the BROWSER's local
    // timezone, but the server compares against that same timestamp truncated in the DATABASE's timezone
    // (to_char(started_at, 'YYYY-MM-DD'), which defaults to UTC). A few hours a day, local and UTC disagree
    // on the calendar date, and the server then rejects the pre-filled date as "does not cover the selected
    // date" - a real, pre-existing mismatch (unrelated to this phase), not something to route around in the
    // app. Re-filling with the server's own value here just keeps this harness reliable at any time of day.
    const entryDateRow = await db.query(
      "select to_char(started_at, 'YYYY-MM-DD') as d from time_entries where description = 'UI verify manual work on an unassigned project'"
    )
    const serverEntryDate = entryDateRow.rows[0].d
    const approveCard = cardByHeading(page, 'Approve & Assign')
    const approveDateInputs = approveCard.locator('input[type="date"]')
    await approveDateInputs.nth(0).fill(serverEntryDate)
    await approveDateInputs.nth(1).fill(serverEntryDate)
    await page.getByRole('button', { name: 'Confirm' }).click()
    await page.waitForSelector('text=Nothing waiting for review.', { timeout: 10000 })
    await screenshot(page, 'pending-work-approved')
    record('pending work entry approved', true)

    await page.getByRole('link', { name: 'Time Tracking', exact: true }).click()
    await page.waitForSelector('h1:has-text("Time Tracking")')
    await page.locator('.card').locator('select').first().selectOption({ label: 'UI Verify Employee' })
    await goToRoute(page, '/time-tracking', 'admin', 'Clock In / Out')
    await page.waitForSelector('text=UI Verify Project', { timeout: 10000 })
    await screenshot(page, 'time-tracking-review')
    record('time tracking review shows the employee\'s real sessions and entries', true)

    // ======================================================================
    // Extra: a very long project name (chart/table wrapping), dashboard with real data,
    // horizontal-overflow checks, sidebar-stays-fixed-while-scrolling.
    // ======================================================================
    async function hasHorizontalOverflow(p) {
      return p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    }

    const LONG_PROJECT_NAME =
      'A Very Long Project Name That Keeps Going To See If The Chart Axis And Table Column Truncate Or Wrap Instead Of Breaking The Page Layout'

    await page.getByRole('link', { name: 'Projects', exact: true }).click()
    await page.waitForSelector('h1:has-text("Projects")')
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.waitForSelector('#project-entry')
    const longNameCard = cardByHeading(page, 'Add Project')
    await longNameCard.locator('select').first().selectOption({ label: 'UI Verify Client' })
    await longNameCard.locator('input').nth(0).fill(LONG_PROJECT_NAME)
    await longNameCard.getByLabel('Total Fee').fill('5000')
    await page.getByRole('button', { name: 'Add Project' }).click()
    await page.waitForSelector('.toast-success')
    await page.waitForSelector('.toast', { state: 'detached', timeout: 7000 }).catch(() => undefined)
    record('project with a very long name created', true)
    await screenshot(page, 'projects-long-name-desktop')
    record('projects page has no horizontal overflow (long name, desktop)', !(await hasHorizontalOverflow(page)))

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.waitForSelector('text=Confirmed Project Value')
    await page.waitForTimeout(500) // let the lazy-loaded chart chunks mount and recharts measure its container
    await screenshot(page, 'dashboard-real-data')
    const chartSvgCount = await page.locator('.dashboard-charts svg').count()
    record('dashboard charts render with real data (svg present)', chartSvgCount > 0, `svg count=${chartSvgCount}`)
    record('dashboard has no horizontal overflow (long project name, desktop)', !(await hasHorizontalOverflow(page)))

    const sidebarBefore = await page.locator('.app-sidebar').boundingBox()
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const sidebarAfter = await page.locator('.app-sidebar').boundingBox()
    record(
      'sidebar stays fixed in place while the page scrolls',
      Boolean(sidebarBefore && sidebarAfter && sidebarBefore.y === sidebarAfter.y && sidebarBefore.x === sidebarAfter.x),
      `before=${JSON.stringify(sidebarBefore)} after=${JSON.stringify(sidebarAfter)}`
    )
    await page.evaluate(() => window.scrollTo(0, 0))

    // ======================================================================
    // Phone-width pass: revisit every route at a phone viewport, screenshot each, and
    // check for horizontal overflow at each one.
    // ======================================================================
    await page.setViewportSize({ width: 390, height: 844 })

    const mobileRoutes = [
      ['/dashboard', 'Confirmed Project Value'],
      ['/clients', 'UI Verify Client'],
      ['/projects', LONG_PROJECT_NAME],
      ['/payments', 'UI Verify Project'],
      ['/employees', 'UI Verify Employee'],
      ['/assignments', 'Select Project'],
      ['/estimates', 'UI Verify Client'],
      ['/invoices', 'UI Verify Client'],
      ['/financial-summary', 'All project figures'],
      ['/time-tracking', 'Review when employees clocked in'],
      ['/pending-work', 'Nothing waiting for review.'],
    ]
    for (const [route, waitText] of mobileRoutes) {
      await page.goto(baseUrl + route)
      await page.waitForSelector(`text=${waitText}`, { timeout: 10000 })
      await page.waitForTimeout(300)
      await screenshot(page, `mobile${route.replace(/\//g, '-')}`)
      record(`mobile ${route} has no horizontal overflow`, !(await hasHorizontalOverflow(page)))
    }

    // ---- mobile menu: hidden by default, opens via hamburger, closes after following a link ----
    await page.goto(baseUrl + '/dashboard')
    await page.waitForSelector('text=Confirmed Project Value')
    const sidebarHiddenInitially = (await page.locator('#app-sidebar.sidebar-open').count()) === 0
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.waitForSelector('#app-sidebar.sidebar-open')
    await page.waitForTimeout(300) // let the 160ms slide-in transition finish before screenshotting
    await screenshot(page, 'mobile-menu-open')
    await page.getByRole('link', { name: 'Clients', exact: true }).click()
    await page.waitForSelector('h1:has-text("Clients")')
    const sidebarClosedAfterNav = (await page.locator('#app-sidebar.sidebar-open').count()) === 0
    record('mobile menu hidden by default, opens via hamburger, closes after following a link', sidebarHiddenInitially && sidebarClosedAfterNav)

    await page.setViewportSize({ width: 1280, height: 900 })

    await context.close()
  } catch (err) {
    record(`UNCAUGHT: ${err.message}`, false)
    throw err
  } finally {
    await browser.close().catch(() => {})
    await new Promise((resolve) => httpServer.close(resolve))
  }
}

main()
  .catch((err) => {
    console.error('[harness] FATAL', err.message)
    process.exitCode = 1
  })
  .finally(() => {
    printReport()
    fs.rmSync(SERVER_PUBLIC_DIR, { recursive: true, force: true })
    console.log('[harness] removed server/public (temporary build copy)')
    // Force the process down even if PGlite/Playwright/the HTTP server left a handle open -
    // otherwise a mid-run failure can leave the harness hanging indefinitely instead of exiting.
    process.exit(process.exitCode ?? 0)
  })
