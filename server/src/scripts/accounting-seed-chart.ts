// Idempotent chart-of-accounts seeder for Phase 1B. Identifies accounts by a stable `code`, never by database
// id - re-running this is always safe: an account whose code already exists is left exactly as it is (never
// updated, never overwritten, never deleted), even if an admin has since renamed it in Setup. This script
// only ever INSERTs brand-new rows for codes that don't exist yet.
//
//   npm run accounting:seed -- --book=NEXTUDIO             dry run: reports what WOULD be created, writes nothing
//   npm run accounting:seed -- --book=NEXTUDIO --apply      actually creates the missing accounts
//   npm run accounting:seed -- --book=NEXTUDIO_SARL [--apply]
//
// This is a server-console script, like migrate.ts/backup.ts/create-user.ts - "admin-only" is enforced by
// requiring shell access to the server, the same way those do; it has no HTTP endpoint.
import { pool } from '../db'
import { withTransaction } from '../http'
import { writeAuditLog } from '../accounting/auditLog'

type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
type ChartEntry = { code: string; name: string; type: AccountType; description?: string }

function normalBalance(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit'
}

// The full proposed NEXTUDIO chart - see docs/ACCOUNTING-CHART.md (or the Phase 1B report) for the reasoning
// behind each account. Deliberately NOT the historical Polypus chart: a clean, minimal set of the categories
// actually needed for daily use, adapted from useful Polypus concepts.
export const NEXTUDIO_CHART: ChartEntry[] = [
  // Assets
  { code: 'AST-CASH', name: 'Cash', type: 'asset' },
  { code: 'AST-BANK', name: 'Bank', type: 'asset' },
  { code: 'AST-PETTY', name: 'Petty Cash', type: 'asset' },
  {
    code: 'AST-PROJFUND', name: 'Project Funds / Project Cash', type: 'asset',
    description: 'Grouping/control account only - never posted to directly. Each project fund (DNT Cash, SBM Cash, ...) gets its own dedicated ledger account filed under this one, auto-created when the fund is set up.',
  },
  { code: 'AST-RECV', name: 'Client Receivables', type: 'asset' },
  { code: 'AST-REIMB', name: 'Reimbursable Project Expenses', type: 'asset' },
  // Liabilities
  { code: 'LIA-CLIENTFUNDS', name: 'Client Project Funds / Funds Held for Projects', type: 'liability' },
  { code: 'LIA-PAYABLES', name: 'Supplier/Contractor Payables', type: 'liability' },
  { code: 'LIA-PARTNER', name: 'Partner Current/Funding Accounts', type: 'liability' },
  // Equity
  {
    code: 'EQ-OPENING', name: 'Opening Balance Equity', type: 'equity',
    description: 'The offsetting side of every opening-balance entry - never income/expense or Partner Funding. See postingService.ts postOpeningBalance.',
  },
  // Income
  { code: 'INC-FEES', name: 'Professional / Architecture Fees', type: 'income' },
  { code: 'INC-OTHER', name: 'Other Operating Income', type: 'income' },
  // Expenses / project costs
  { code: 'EXP-CONCRETE', name: 'Concrete Works', type: 'expense' },
  { code: 'EXP-STEEL', name: 'Steel', type: 'expense' },
  { code: 'EXP-LABOR', name: 'Labor', type: 'expense' },
  { code: 'EXP-EXCAVATION', name: 'Excavation', type: 'expense' },
  { code: 'EXP-MASONRY', name: 'Masonry', type: 'expense' },
  { code: 'EXP-TILING', name: 'Tiling', type: 'expense' },
  { code: 'EXP-PAINTING', name: 'Painting', type: 'expense' },
  { code: 'EXP-CLADDING', name: 'Cladding', type: 'expense' },
  { code: 'EXP-WATERPROOF', name: 'Waterproofing', type: 'expense' },
  { code: 'EXP-PLUMBING', name: 'Plumbing', type: 'expense' },
  { code: 'EXP-ELECTRICAL', name: 'Electrical', type: 'expense' },
  { code: 'EXP-ALUMINIUM', name: 'Aluminium', type: 'expense' },
  { code: 'EXP-GYPSUM', name: 'Gypsum', type: 'expense' },
  { code: 'EXP-CARPENTRY', name: 'Carpentry', type: 'expense' },
  { code: 'EXP-PERMITS', name: 'Permits / Government Fees', type: 'expense' },
  { code: 'EXP-TRANSPORT', name: 'Transportation / Delivery', type: 'expense' },
  { code: 'EXP-OTHERPROJECT', name: 'Other Project Costs', type: 'expense' },
  // Company expenses
  { code: 'CEXP-SALARIES', name: 'Salaries', type: 'expense' },
  { code: 'CEXP-RENT', name: 'Rent', type: 'expense' },
  { code: 'CEXP-SOFTWARE', name: 'Software / Subscriptions', type: 'expense' },
  { code: 'CEXP-PRINTING', name: 'Printing / Stationery', type: 'expense' },
  { code: 'CEXP-OFFICE', name: 'Office Expenses', type: 'expense' },
  { code: 'CEXP-PROFFEES', name: 'Professional Fees', type: 'expense' },
  { code: 'CEXP-BANKFEES', name: 'Bank Fees', type: 'expense' },
  { code: 'CEXP-OTHEROPEX', name: 'Other Operating Expenses', type: 'expense' },
]

// NEXTUDIO SARL is a separate legal book - deliberately only the safe, structural minimum needed to record
// cash movement, professional income and basic operating cost. No construction project-cost categories (those
// are NEXTUDIO's own), and no Lebanese tax/VAT accounts - those are a later, explicit phase.
export const NEXTUDIO_SARL_CHART: ChartEntry[] = NEXTUDIO_CHART.filter((entry) =>
  ['AST-CASH', 'AST-BANK', 'AST-RECV', 'LIA-CLIENTFUNDS', 'LIA-PAYABLES', 'LIA-PARTNER', 'EQ-OPENING', 'INC-FEES', 'INC-OTHER', 'CEXP-BANKFEES', 'CEXP-OTHEROPEX'].includes(
    entry.code
  )
)

async function main() {
  const args = process.argv.slice(2)
  const bookArg = args.find((a) => a.startsWith('--book='))?.split('=')[1]
  const apply = args.includes('--apply')
  if (!bookArg || (bookArg !== 'NEXTUDIO' && bookArg !== 'NEXTUDIO_SARL')) {
    console.error('Usage: tsx accounting-seed-chart.ts --book=NEXTUDIO|NEXTUDIO_SARL [--apply]')
    process.exitCode = 1
    return
  }
  const chart = bookArg === 'NEXTUDIO' ? NEXTUDIO_CHART : NEXTUDIO_SARL_CHART

  const book = (await pool.query('SELECT id, code, name FROM accounting_books WHERE code = $1', [bookArg])).rows[0]
  if (!book) throw new Error(`Book ${bookArg} does not exist - has the Phase 1A migration been applied?`)

  const existing = await pool.query('SELECT code FROM accounting_accounts WHERE book_id = $1 AND code IS NOT NULL', [book.id])
  const existingCodes = new Set<string>(existing.rows.map((r) => r.code))

  const toCreate = chart.filter((entry) => !existingCodes.has(entry.code))
  const toSkip = chart.filter((entry) => existingCodes.has(entry.code))

  console.log(`${apply ? 'APPLYING' : 'DRY RUN (nothing will be written)'} - book ${book.code} (${book.name})`)
  console.log(`${chart.length} accounts in the proposed chart\n`)

  for (const entry of toSkip) console.log(`  skip     (code already exists): ${entry.code.padEnd(16)} ${entry.name}`)
  for (const entry of toCreate) console.log(`  ${apply ? 'created ' : 'would create:'} ${entry.code.padEnd(16)} ${entry.name} [${entry.type}]`)

  console.log(`\n${toCreate.length} to create, ${toSkip.length} already present, ${chart.length} total.`)

  if (!apply) {
    console.log('\nDry run only - nothing was written. Re-run with --apply to actually create the accounts listed above.')
    return
  }
  if (toCreate.length === 0) {
    console.log('\nNothing to do - every account in this chart already exists.')
    return
  }

  const admin = (await pool.query(`SELECT id FROM app_users WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0]
  if (!admin) throw new Error('No admin app_users row found to attribute this run to')

  await withTransaction(async (client) => {
    for (const entry of toCreate) {
      const inserted = await client.query(
        `INSERT INTO accounting_accounts (book_id, code, name, type, normal_balance, description)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [book.id, entry.code, entry.name, entry.type, normalBalance(entry.type), entry.description ?? null]
      )
      await writeAuditLog(client, {
        book_id: book.id,
        entity_type: 'account',
        entity_id: inserted.rows[0].id,
        action: 'create',
        performed_by_user_id: admin.id,
        after: entry,
        notes: 'accounting-seed-chart.ts',
      })
    }
  })

  console.log(`\nCreated ${toCreate.length} accounts.`)
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Seed failed:', err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
