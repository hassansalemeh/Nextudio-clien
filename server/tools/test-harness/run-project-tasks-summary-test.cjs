// Isolated verification for the Project Detail "Tasks" column (formerly "Assignment"):
// compact per-employee summary, expand/collapse detail row, and friendly local-date formatting.
//
// Same isolation model as run-ui-verification.cjs (see its header comment and the README in this folder):
// in-memory PGlite database, the real built server, a real headless browser - never production.
//
// Usage (from the repo root):
//   node server/tools/test-harness/run-project-tasks-summary-test.cjs
//
// Unlike run-ui-verification.cjs, this seeds employees/work_assignments directly via SQL instead of
// driving the UI to create them - we need precise, varied dates/descriptions (10+ tasks, a one-day task,
// a task from last year, a long description) and driving the "Assign Work" form that many times would
// only slow the run down without exercising anything this test cares about.

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
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots', 'project-tasks-summary')

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const ADMIN_EMAIL = 'tasks-summary-admin@nextudio.local'
const ADMIN_PASSWORD = 'verify-admin-pw-12345'

// ---- local-date helpers, mirroring client/src/shared/lib/timeUtils.ts exactly (kept in sync manually,
// same approach run-ui-verification.cjs already uses for its own date checks) ----
function pad(n) {
  return String(n).padStart(2, '0')
}
function parseDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}
function localDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function addDaysLocal(dateString, days) {
  const date = parseDateString(dateString)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}
function formatShortDateLocal(dateString) {
  const date = parseDateString(dateString)
  const options = { month: 'short', day: 'numeric' }
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString('en-US', options)
}
function formatDateRangeLocal(startDate, endDate) {
  if (startDate === endDate) return formatShortDateLocal(startDate)
  return `${formatShortDateLocal(startDate)} \u2192 ${formatShortDateLocal(endDate)}`
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

function log(...args) {
  console.log('[tasks-summary]', ...args)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  log(ok ? 'PASS' : 'FAIL', '-', name, detail ? `(${detail})` : '')
}

function printReport() {
  log('')
  log('==== CHECKS ====')
  for (const r of results) log(r.ok ? 'PASS' : 'FAIL', '-', r.name, r.detail ? `(${r.detail})` : '')
  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    log(`\n${failed.length} check(s) failed. See screenshots in ${SCREENSHOT_DIR}`)
    process.exitCode = 1
  } else {
    log('\nAll checks passed.')
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

  process.env.DATABASE_URL = 'postgres://pglite-fake-host/pglite'
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of migrationFiles) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'))
  }
  log(`applied ${migrationFiles.length} migrations to the in-memory database`)

  const adminUser = await db.query('insert into app_users (email, password_hash, role) values ($1, $2, $3) returning id', [
    ADMIN_EMAIL,
    hashPassword(ADMIN_PASSWORD),
    'admin',
  ])
  const nextudioOrg = await db.query("select id from organizations where name = 'Nextudio'")
  const nextudioOrgId = nextudioOrg.rows[0].id
  await db.query('insert into organization_members (organization_id, user_id, role) values ($1, $2, $3)', [
    nextudioOrgId,
    adminUser.rows[0].id,
    'admin',
  ])

  // ======================================================================
  // Seed: one client, one project, four employees covering every case from the spec.
  // ======================================================================
  const client = await db.query("insert into clients (name) values ('Tasks Summary Client') returning id")
  const clientId = client.rows[0].id
  const project = await db.query(
    "insert into projects (client_id, name, total_fee, status) values ($1, 'Tasks Summary Project', 10000, 'in_progress') returning id",
    [clientId]
  )
  const projectId = project.rows[0].id

  async function addEmployee(fullName) {
    const row = await db.query(
      "insert into employees (full_name, position, monthly_salary) values ($1, 'Designer', 5000) returning id",
      [fullName]
    )
    return row.rows[0].id
  }
  async function assignToTeam(employeeId) {
    await db.query('insert into project_assignments (project_id, employee_id, is_active) values ($1, $2, true)', [projectId, employeeId])
  }
  async function addWork(employeeId, startDate, endDate, description) {
    await db.query('insert into work_assignments (project_id, employee_id, start_date, end_date, description) values ($1, $2, $3, $4, $5)', [
      projectId,
      employeeId,
      startDate,
      endDate,
      description,
    ])
  }

  const LONG_DESCRIPTION =
    "Coordinated with the structural engineer, the lighting consultant, and the client's facilities team to resolve the remaining punch list items before the final walkthrough, including sign-off on paint colors, hardware finishes, and the millwork mockup approved last week."
  const ONE_DAY_DESCRIPTION = 'Site walkthrough with the client to confirm remaining punch list items'
  const LAST_YEAR_DESCRIPTION = 'Kickoff meeting with the client to review initial concept boards and material direction'

  const busyEmployeeId = await addEmployee('Busy Bee')
  const busyAssignments = []
  for (let i = 0; i < 8; i++) {
    const start = addDaysLocal('2026-01-12', i * 20)
    busyAssignments.push({ start_date: start, end_date: start, description: `Weekly site coordination check-in #${i + 1}` })
  }
  busyAssignments.push({ start_date: '2026-09-24', end_date: '2026-09-24', description: ONE_DAY_DESCRIPTION })
  busyAssignments.push({ start_date: '2025-12-12', end_date: '2025-12-12', description: LAST_YEAR_DESCRIPTION })
  busyAssignments.push({ start_date: '2026-08-28', end_date: '2026-09-21', description: LONG_DESCRIPTION })
  for (const a of busyAssignments) await addWork(busyEmployeeId, a.start_date, a.end_date, a.description)

  const multiEmployeeId = await addEmployee('Multi Tasker')
  const multiAssignments = [
    { start_date: '2026-03-01', end_date: '2026-03-05', description: 'Prepare material boards for the client presentation' },
    { start_date: '2026-05-10', end_date: '2026-05-10', description: 'Site visit to check tile installation progress' },
    { start_date: '2026-07-15', end_date: '2026-07-20', description: 'Coordinate the furniture delivery schedule with the vendor' },
  ]
  for (const a of multiAssignments) await addWork(multiEmployeeId, a.start_date, a.end_date, a.description)

  const soloEmployeeId = await addEmployee('Solo Tasker')
  const soloAssignment = { start_date: '2026-06-01', end_date: '2026-06-03', description: 'Final walkthrough and punch list sign-off with the client' }
  await addWork(soloEmployeeId, soloAssignment.start_date, soloAssignment.end_date, soloAssignment.description)

  const benchEmployeeId = await addEmployee('Bench Employee')
  await assignToTeam(benchEmployeeId) // no work_assignments - must still appear via the team-assignment row

  log('seeded client, project, and 4 employees (11, 3, 1, 0 tasks)')

  // ---- expected values, computed the same way the component should ----
  const expectedBusyRange = formatDateRangeLocal(
    busyAssignments.reduce((min, a) => (a.start_date < min ? a.start_date : min), busyAssignments[0].start_date),
    busyAssignments.reduce((max, a) => (a.end_date > max ? a.end_date : max), busyAssignments[0].end_date)
  )
  const expectedBusyLatest = busyAssignments.reduce((a, b) => (b.start_date > a.start_date ? b : a))
  const busySortedNewestFirst = [...busyAssignments].sort((a, b) => b.start_date.localeCompare(a.start_date))

  // ---- boot the real server ----
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

  const consoleErrors = []

  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('pageerror', (err) => consoleErrors.push(err.message))

    await page.goto(baseUrl)
    await page.waitForSelector('text=Log in')
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForSelector('text=Confirmed Project Value')
    record('admin login', true)
    // The pre-login "am I already signed in?" check (GET /api/auth/me) always 401s for a fresh session -
    // expected, and logged by the browser as a console error. Only watch for console errors from here on.
    consoleErrors.length = 0

    await page.getByRole('link', { name: 'Projects', exact: true }).click()
    await page.waitForSelector('h1:has-text("Projects")')
    await page.getByRole('link', { name: 'Tasks Summary Project' }).click()
    await page.waitForSelector('h1:has-text("Tasks Summary Project")')
    await page.waitForSelector('text=Employees / Project Work')
    record('project detail page loads', true)

    const table = page.locator('.card', { has: page.locator('h2', { hasText: 'Employees / Project Work' }) }).locator('table.data-table')
    await table.waitFor()

    // ======================================================================
    // Column header renamed
    // ======================================================================
    const headerText = await table.locator('thead th').allInnerTexts()
    record('column header renamed from "Assignment" to "Tasks"', headerText.includes('Tasks') && !headerText.includes('Assignment'), headerText.join(', '))

    // ======================================================================
    // Compact by default: exactly 4 rows (one per employee), no detail rows open
    // ======================================================================
    const rowsClosed = await table.locator('tbody tr').count()
    record('rows stay compact by default (4 employee rows, no detail rows)', rowsClosed === 4, `rows=${rowsClosed}`)

    function rowFor(name) {
      return table.locator('tbody tr', { has: page.locator('td', { hasText: name }) }).first()
    }

    // ---- Busy Bee (11 tasks): summary, range, "Latest:", button present ----
    const busyRow = rowFor('Busy Bee')
    const busyCellText = await busyRow.locator('td[data-label="Tasks"]').innerText()
    record('11-task employee shows "11 tasks"', busyCellText.includes('11 tasks'), busyCellText)
    record('11-task employee shows the correct overall date range', busyCellText.includes(expectedBusyRange), `expected "${expectedBusyRange}" in: ${busyCellText}`)
    record(
      '11-task employee shows "Latest:" with the most recent task\'s description',
      busyCellText.includes('Latest:') && busyCellText.includes(expectedBusyLatest.description),
      busyCellText
    )
    const busyToggle = busyRow.getByRole('button', { name: 'Show tasks' })
    record('11-task employee has a "Show tasks" button', (await busyToggle.count()) === 1)

    // ---- the long "Latest:" line is visually truncated to one line (scrollWidth > clientWidth) ----
    const truncatedBox = busyRow.locator('.cell-truncate')
    const isTruncated = await truncatedBox.evaluate((el) => el.scrollWidth > el.clientWidth)
    record('long "Latest:" description is truncated to one line (desktop)', isTruncated)

    // ---- Multi Tasker (3 tasks): also has a button, independent of Busy Bee ----
    const multiRow = rowFor('Multi Tasker')
    const multiCellText = await multiRow.locator('td[data-label="Tasks"]').innerText()
    record('3-task employee shows "3 tasks"', multiCellText.includes('3 tasks'), multiCellText)
    const multiToggle = multiRow.getByRole('button', { name: 'Show tasks' })
    record('3-task employee has a "Show tasks" button', (await multiToggle.count()) === 1)

    // ---- Solo Tasker (1 task): shown directly, no button ----
    const soloRow = rowFor('Solo Tasker')
    const soloCellText = await soloRow.locator('td[data-label="Tasks"]').innerText()
    const soloExpectedDate = formatDateRangeLocal(soloAssignment.start_date, soloAssignment.end_date)
    record(
      '1-task employee shows the task directly with no button',
      soloCellText.includes(soloExpectedDate) && soloCellText.includes(soloAssignment.description) && !soloCellText.includes('Show tasks'),
      soloCellText
    )

    // ---- Bench Employee (0 tasks): "No tasks", no button ----
    const benchRow = rowFor('Bench Employee')
    const benchCellText = await benchRow.locator('td[data-label="Tasks"]').innerText()
    record('0-task employee shows "No tasks" with no button', benchCellText.trim() === 'No tasks', benchCellText)

    await screenshot(page, 'desktop-closed')

    // ======================================================================
    // Expand Busy Bee: button flips to "Hide tasks", detail row appears, newest first, full text
    // ======================================================================
    await busyToggle.click()
    await page.waitForSelector('text=Hide tasks')
    record('clicking "Show tasks" flips the button to "Hide tasks"', (await busyRow.getByRole('button', { name: 'Hide tasks' }).count()) === 1)
    const busyButtonExpanded = await busyRow.getByRole('button', { name: 'Hide tasks' }).getAttribute('aria-expanded')
    record('expanded button has aria-expanded="true"', busyButtonExpanded === 'true')

    const rowsOpen = await table.locator('tbody tr').count()
    record('exactly one detail row appears when expanded', rowsOpen === rowsClosed + 1, `rows=${rowsOpen}`)

    const detailRow = table.locator('tr.task-detail-row').first()
    const detailItems = detailRow.locator('.task-detail-item')
    record('detail row lists every task', (await detailItems.count()) === busyAssignments.length, `count=${await detailItems.count()}`)

    const firstItemText = await detailItems.first().innerText()
    record(
      'detail row is sorted newest first',
      firstItemText.includes(formatShortDateLocal(busySortedNewestFirst[0].start_date)) || firstItemText.includes(expectedBusyLatest.description),
      firstItemText
    )

    const detailText = await detailRow.innerText()
    record('detail row shows the long description in full (not truncated)', detailText.includes(LONG_DESCRIPTION))

    // ---- date format checks inside the detail row ----
    const oneDayItem = detailRow.locator('.task-detail-item', { has: page.locator('.task-detail-desc', { hasText: ONE_DAY_DESCRIPTION }) })
    const oneDayDateText = await oneDayItem.locator('.task-detail-date').innerText()
    record(
      'this-year one-day task shows a single short date with no arrow and no year',
      oneDayDateText === formatShortDateLocal('2026-09-24') && !oneDayDateText.includes('\u2192') && !/\d{4}/.test(oneDayDateText),
      oneDayDateText
    )

    const lastYearItem = detailRow.locator('.task-detail-item', { has: page.locator('.task-detail-desc', { hasText: LAST_YEAR_DESCRIPTION }) })
    const lastYearDateText = await lastYearItem.locator('.task-detail-date').innerText()
    record('last-year task shows its year', lastYearDateText === formatShortDateLocal('2025-12-12') && lastYearDateText.includes('2025'), lastYearDateText)

    const rangeItem = detailRow.locator('.task-detail-item', { has: page.locator('.task-detail-desc', { hasText: LONG_DESCRIPTION }) })
    const rangeDateText = await rangeItem.locator('.task-detail-date').innerText()
    record('a multi-day task shows "start \u2192 end"', rangeDateText === formatDateRangeLocal('2026-08-28', '2026-09-21'), rangeDateText)

    await screenshot(page, 'desktop-opened')

    // ======================================================================
    // Independence: opening Multi Tasker's panel doesn't touch Busy Bee's, and closing one leaves
    // the other open
    // ======================================================================
    await multiToggle.click()
    await page.waitForTimeout(150)
    const bothOpenCount = await table.locator('tr.task-detail-row').count()
    record('opening a second employee\'s panel leaves the first one open too', bothOpenCount === 2, `open panels=${bothOpenCount}`)

    await busyRow.getByRole('button', { name: 'Hide tasks' }).click()
    await page.waitForTimeout(150)
    const afterCloseCount = await table.locator('tr.task-detail-row').count()
    const multiStillOpen = (await multiRow.getByRole('button', { name: 'Hide tasks' }).count()) === 1
    record(
      'closing one employee\'s panel leaves the other employee\'s panel open (independent toggles)',
      afterCloseCount === 1 && multiStillOpen,
      `open panels=${afterCloseCount}`
    )
    await multiRow.getByRole('button', { name: 'Hide tasks' }).click()
    await page.waitForTimeout(150)

    // ======================================================================
    // Phone width pass
    // ======================================================================
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(300)
    async function hasHorizontalOverflow() {
      return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    }
    await screenshot(page, 'mobile-closed')
    record('project detail page has no horizontal overflow at phone width (closed)', !(await hasHorizontalOverflow()))

    await busyRow.getByRole('button', { name: 'Show tasks' }).click()
    await page.waitForSelector('text=Hide tasks')
    await page.waitForTimeout(300)
    await table.locator('tr.task-detail-row').first().scrollIntoViewIfNeeded()
    await screenshot(page, 'mobile-opened')
    record('project detail page has no horizontal overflow at phone width (opened)', !(await hasHorizontalOverflow()))
    const mobileDetailVisible = await table.locator('tr.task-detail-row').first().isVisible()
    record('detail panel is visible under the employee\'s card at phone width', mobileDetailVisible)

    record('no console errors during the whole run', consoleErrors.length === 0, consoleErrors.join(' | '))

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
    console.error('[tasks-summary] FATAL', err.message)
    process.exitCode = 1
  })
  .finally(() => {
    printReport()
    fs.rmSync(SERVER_PUBLIC_DIR, { recursive: true, force: true })
    console.log('[tasks-summary] removed server/public (temporary build copy)')
    process.exit(process.exitCode ?? 0)
  })
