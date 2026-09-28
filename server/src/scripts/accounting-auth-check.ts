// "A non-admin cannot access accounting endpoints" is guaranteed structurally, not by a runtime check per
// route: server/src/auth.ts's enforceRole() denies every /api route by default unless it is explicitly
// listed in EMPLOYEE_ROUTES. So the only way an accounting route could ever be reachable by an employee is
// if someone added it to that allowlist. Proving that never happened - and proving the accounting routes are
// really registered behind registerAuth() - only requires reading source, not a live login or database
// write, so this script never touches the database or a running server, and produces nothing that would need
// cleanup. It is deliberately NOT an HTTP-based test with a real employee session, since creating one would
// mean writing a throwaway app_users/employees row into the production database, which the accounting rollout
// intentionally avoids until this code has been reviewed and migrated by hand.
//
//   npm run test:accounting-auth
import fs from 'fs'
import path from 'path'

let passed = 0
function report(name: string) {
  passed++
  console.log(`  ok: ${name}`)
}

function fail(message: string): never {
  throw new Error(message)
}

function main() {
  const authSource = fs.readFileSync(path.join(__dirname, '../auth.ts'), 'utf8')
  const indexSource = fs.readFileSync(path.join(__dirname, '../index.ts'), 'utf8')

  const allowlistMatch = /const EMPLOYEE_ROUTES = new Set\(\[([\s\S]*?)\]\)/.exec(authSource)
  if (!allowlistMatch) fail('Could not find EMPLOYEE_ROUTES in auth.ts - has it been renamed or restructured?')
  if (allowlistMatch[1].includes('/accounting')) {
    fail('An accounting route was found in EMPLOYEE_ROUTES - this would let employees reach it. It must not be there.')
  }
  report('no accounting route is in the employee allowlist (every accounting route is admin-only by default)')

  const accountingRouteFiles = [
    'accounting/booksRoutes', 'accounting/accountsRoutes', 'accounting/cashAccountsRoutes', 'accounting/counterpartiesRoutes',
    'accounting/transactionsRoutes', 'accounting/journalRoutes', 'accounting/dashboardRoutes', 'accounting/reportsRoutes', 'accounting/openingBalanceRoutes',
    'accounting/legacyJobsRoutes',
  ]
  for (const file of accountingRouteFiles) {
    const source = fs.readFileSync(path.join(__dirname, `../${file}.ts`), 'utf8')
    const paths = [...source.matchAll(/app\.(get|post|put|delete)\('([^']+)'/g)].map((m) => m[2])
    if (paths.length === 0) fail(`${file}.ts registers no routes - expected at least one`)
    for (const routePath of paths) {
      if (!routePath.startsWith('/api/accounting/')) fail(`${file}.ts registers ${routePath}, which is outside /api/accounting`)
    }
  }
  report('every accounting route lives under /api/accounting (the prefix enforceRole gates)')

  // registerAuth(app) must run before every accounting route module, since that is what installs the
  // authenticate + enforceRole middleware ahead of them (server/src/auth.ts:209, `app.use('/api', ...)`)
  const registerAuthIndex = indexSource.indexOf('registerAuth(app)')
  if (registerAuthIndex === -1) fail('registerAuth(app) is not called from index.ts')
  for (const registerCall of [
    'registerAccountingBookRoutes(app)', 'registerAccountingAccountRoutes(app)', 'registerAccountingCashAccountRoutes(app)',
    'registerAccountingCounterpartyRoutes(app)', 'registerAccountingTransactionRoutes(app)', 'registerAccountingJournalRoutes(app)',
    'registerAccountingDashboardRoutes(app)', 'registerAccountingReportRoutes(app)', 'registerAccountingOpeningBalanceRoutes(app)',
    'registerAccountingLegacyJobRoutes(app)',
  ]) {
    const callIndex = indexSource.indexOf(registerCall)
    if (callIndex === -1) fail(`${registerCall} is not called from index.ts`)
    if (callIndex < registerAuthIndex) fail(`${registerCall} is registered before registerAuth(app) - it would not be protected`)
  }
  report('every accounting route module is registered after registerAuth(app), so it is behind the auth gate')

  console.log(`\n${passed} checks passed.`)
}

if (require.main === module) {
  try {
    main()
  } catch (err) {
    console.error(`\nFAILED after ${passed} checks:`, err)
    process.exitCode = 1
  }
}
