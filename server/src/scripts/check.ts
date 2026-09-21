// Checks that this machine can run the application. Run it ON THE HOST after uploading:   npm run check
// It tests the things that differ between hosts: Node version, environment variables, the database connection
// (and whether it is encrypted), and whether a PDF can really be produced. It prints no secret values.
import os from 'os'
import { pool } from '../db'
import { checkPdfEngine } from '../documents'

const REQUIRED_ENV = ['DATABASE_URL']
const RECOMMENDED_ENV = ['NODE_ENV', 'PUBLIC_URL', 'PORT']
const OPTIONAL_ENV = ['STANDARD_MONTHLY_HOURS', 'PDF_BROWSER_PATH', 'PDF_NO_SANDBOX', 'COOKIE_SECURE', 'TRUST_PROXY', 'DATABASE_CA_CERT', 'DB_POOL_MAX']

let failures = 0
const ok = (message: string) => console.log(`  OK    ${message}`)
const warn = (message: string) => console.log(`  WARN  ${message}`)
const fail = (message: string) => {
  failures++
  console.log(`  FAIL  ${message}`)
}

async function main() {
  console.log('\n1. Runtime')
  const major = Number(process.versions.node.split('.')[0])
  major >= 18 ? ok(`Node ${process.version} on ${process.platform}/${process.arch}`) : fail(`Node ${process.version} is too old (18 or newer is required)`)
  ok(`memory: ${(os.totalmem() / 1e9).toFixed(1)} GB total, ${(os.freemem() / 1e9).toFixed(1)} GB free on the machine`)
  process.env.NODE_ENV === 'production' ? ok('NODE_ENV=production') : warn(`NODE_ENV is "${process.env.NODE_ENV ?? 'not set'}" (production hosts should set NODE_ENV=production)`)

  console.log('\n2. Environment variables (names only, values are never shown)')
  for (const name of REQUIRED_ENV) process.env[name] ? ok(`${name} is set`) : fail(`${name} is MISSING`)
  for (const name of RECOMMENDED_ENV) process.env[name] ? ok(`${name} is set`) : warn(`${name} is not set`)
  for (const name of OPTIONAL_ENV) if (process.env[name]) ok(`${name} is set (optional)`)
  if (process.env.PUBLIC_URL && !process.env.PUBLIC_URL.startsWith('https://')) warn('PUBLIC_URL should start with https://')

  console.log('\n3. Database')
  try {
    const started = Date.now()
    const version = await pool.query('SELECT version() AS v, current_database() AS db')
    ok(`connected in ${Date.now() - started} ms (${String(version.rows[0].v).split(' on ')[0]})`)
    // ask this application's side of the connection (a database pooler can report its own internal leg instead)
    const client = await pool.connect()
    try {
      const stream = (client as unknown as { connection?: { stream?: { encrypted?: boolean; getProtocol?: () => string } } }).connection?.stream
      stream?.encrypted === true
        ? ok(`the connection to the database is encrypted (${stream.getProtocol?.() ?? 'TLS'})`)
        : fail('the connection to the database is NOT encrypted')
    } finally {
      client.release()
    }
    const counts = await pool.query(
      `SELECT (SELECT count(*) FROM app_users) AS users, (SELECT count(*) FROM projects) AS projects,
              (SELECT count(*) FROM employees) AS employees, (SELECT count(*) FROM time_entries) AS time_entries`
    )
    ok(`data present: ${JSON.stringify(counts.rows[0])}`)
    const latest = await pool.query(`SELECT to_regclass('payments') AS payments, to_regclass('payment_revisions') AS revisions, to_regclass('estimates') AS estimates`)
    latest.rows[0].payments && latest.rows[0].revisions && latest.rows[0].estimates
      ? ok('the latest tables exist (migrations are applied)')
      : fail('some tables are missing: run "npm run migrate"')
  } catch (err) {
    fail(`cannot reach the database: ${(err as Error).message}. If this is a host firewall problem, outbound connections to the database host/port are blocked.`)
  }

  console.log('\n4. PDF generation (quotations and invoices)')
  const pdf = await checkPdfEngine()
  if (pdf.ok) {
    ok(`PDF works: ${pdf.browser} produced ${pdf.bytes} bytes in ${pdf.ms} ms`)
  } else {
    fail(`PDF generation does NOT work on this machine: ${pdf.error}`)
    console.log('        (the rest of the application works without it; only "Preview" / "Download PDF" fail)')
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
}

main()
  .catch((err) => {
    console.error('Check crashed:', err)
    failures++
  })
  .finally(async () => {
    await pool.end().catch(() => undefined)
    process.exit(failures === 0 ? 0 : 1)
  })
