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
//
// `parent` (optional) names another entry's `code` IN THE SAME CHART ARRAY. Parents are always created before
// their children (two passes below), so a child can reference a parent that didn't exist before this run.
import { pool } from '../db'
import { withTransaction } from '../http'
import { writeAuditLog } from '../accounting/auditLog'

type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'
type ChartEntry = { code: string; name: string; type: AccountType; description?: string; parent?: string }

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
  {
    code: 'LIA-CLIENTADV', name: 'Client Advances Held - Unallocated', type: 'liability',
    description: 'Money a client has prepaid that is not (yet) tied to a specific project fund - e.g. no confirmed Control project exists for their job yet. Never used for a genuine receivable; see LIA-CLIENTFUNDS (project-scoped) and AST-RECV (money actually owed to Nextudio) for those. Required for the historical Polypus import - see the Phase 1B historical-import report.',
  },
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
  { code: 'CEXP-UTILITIES', name: 'Utilities (Water / Gas / Electricity)', type: 'expense' },
  { code: 'CEXP-TELECOM', name: 'Telecom / Internet / SMS', type: 'expense' },
  { code: 'CEXP-MAINTENANCE', name: 'Building / Equipment Maintenance', type: 'expense' },
  // Legacy Polypus grouping accounts (requirement 2/3): every legacy account the historical importer could
  // not confidently classify becomes its own named child under one of these three, never merged with an
  // unrelated account and never silently dumped into Other Operating Expenses. See the Phase 1B
  // historical-import report for the full list and reasoning (net-balance-direction heuristic, no invented
  // Lebanese tax treatment).
  {
    code: 'HIST-EXP-ROOT', name: 'Legacy Unclassified Expenses (review required)', type: 'expense',
    description: 'Grouping account only - never posted to directly. Historical Polypus expense accounts the importer could not confidently classify are filed here as individually named children pending manual review.',
  },
  {
    code: 'HIST-AST-ROOT', name: 'Legacy Unclassified Assets (review required)', type: 'asset',
    description: 'Grouping account only - never posted to directly. Historical Polypus asset/balance-sheet accounts (e.g. VAT, Works In Progress) the importer could not confidently classify are filed here pending manual review.',
  },
  {
    code: 'HIST-LIA-ROOT', name: 'Legacy Unclassified Counterparties/Liabilities (review required)', type: 'liability',
    description: 'Grouping account only - never posted to directly. Historical Polypus counterparty accounts whose client-vs-payee direction the importer could not confidently resolve are filed here pending manual review.',
  },
  { code: 'HIST-68511001', name: 'Legacy: Tips & Donnations (historical - review required)', type: 'expense', parent: 'HIST-EXP-ROOT' },
  { code: 'HIST-46190001', name: 'Legacy: Malek Nawfal (historical - review required)', type: 'asset', parent: 'HIST-AST-ROOT' },
]

// NEXTUDIO SARL is a separate legal book. Historically only had the safe structural minimum; the historical
// Polypus import needs the same project-cost categories NEXTUDIO has (SARL's own supplier list - Sabeh Beton,
// Sodamco, CMC, Chebly Contracting - is genuinely construction-material purchasing) plus its own historical
// grouping accounts for VAT/WIP-style legacy balance-sheet accounts. Still no Lebanese VAT/tax TREATMENT is
// asserted anywhere - those legacy accounts are preserved as clearly-labelled historical placeholders, not
// mapped into a real operating VAT account.
export const NEXTUDIO_SARL_CHART: ChartEntry[] = [
  ...NEXTUDIO_CHART.filter((entry) =>
    [
      'AST-CASH', 'AST-BANK', 'AST-RECV', 'LIA-CLIENTFUNDS', 'LIA-PAYABLES', 'LIA-PARTNER', 'LIA-CLIENTADV', 'EQ-OPENING',
      'INC-FEES', 'INC-OTHER', 'CEXP-BANKFEES', 'CEXP-OTHEROPEX', 'CEXP-UTILITIES', 'CEXP-TELECOM', 'CEXP-MAINTENANCE',
      'EXP-CONCRETE', 'EXP-STEEL', 'EXP-LABOR', 'EXP-EXCAVATION', 'EXP-MASONRY', 'EXP-TILING', 'EXP-PAINTING', 'EXP-CLADDING',
      'EXP-WATERPROOF', 'EXP-PLUMBING', 'EXP-ELECTRICAL', 'EXP-ALUMINIUM', 'EXP-GYPSUM', 'EXP-PERMITS', 'EXP-TRANSPORT',
      'EXP-OTHERPROJECT', 'CEXP-SALARIES', 'CEXP-RENT', 'CEXP-SOFTWARE', 'CEXP-PRINTING', 'CEXP-OFFICE', 'CEXP-PROFFEES',
      'HIST-EXP-ROOT', 'HIST-AST-ROOT', 'HIST-LIA-ROOT',
    ].includes(entry.code)
  ),
  { code: 'HIST-44261001', name: 'Legacy: VAT Purchases (historical - review required)', type: 'asset', parent: 'HIST-AST-ROOT' },
  { code: 'HIST-44261002', name: 'Legacy: VAT Office Expenses (historical - review required)', type: 'asset', parent: 'HIST-AST-ROOT' },
  { code: 'HIST-332', name: 'Legacy: Works In Progress (historical - review required)', type: 'asset', parent: 'HIST-AST-ROOT' },
  { code: 'HIST-44252', name: 'Legacy: VAT recoverable/refund (Arabic name in source - historical, review required)', type: 'asset', parent: 'HIST-AST-ROOT' },
]

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

  const existing = await pool.query('SELECT id, code FROM accounting_accounts WHERE book_id = $1 AND code IS NOT NULL', [book.id])
  const existingCodes = new Set<string>(existing.rows.map((r) => r.code))
  const codeToId = new Map<string, number>(existing.rows.map((r) => [r.code as string, r.id as number]))

  const toCreate = chart.filter((entry) => !existingCodes.has(entry.code))
  const toSkip = chart.filter((entry) => existingCodes.has(entry.code))

  console.log(`${apply ? 'APPLYING' : 'DRY RUN (nothing will be written)'} - book ${book.code} (${book.name})`)
  console.log(`${chart.length} accounts in the proposed chart\n`)

  for (const entry of toSkip) console.log(`  skip     (code already exists): ${entry.code.padEnd(16)} ${entry.name}`)
  for (const entry of toCreate) console.log(`  ${apply ? 'created ' : 'would create:'} ${entry.code.padEnd(16)} ${entry.name} [${entry.type}]${entry.parent ? ` (under ${entry.parent})` : ''}`)

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
    // Array order matters here: every parent (e.g. HIST-EXP-ROOT) is listed before its children in the chart
    // arrays above, so by the time a child is reached, its parent's id is already in codeToId - either from
    // a prior run (existing) or from earlier in this same loop (just created).
    for (const entry of toCreate) {
      const parentId = entry.parent ? codeToId.get(entry.parent) : null
      if (entry.parent && parentId === undefined) {
        throw new Error(`Chart entry ${entry.code} references parent ${entry.parent}, which was not created before it - fix the chart array order`)
      }
      const inserted = await client.query(
        `INSERT INTO accounting_accounts (book_id, code, name, type, normal_balance, description, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [book.id, entry.code, entry.name, entry.type, normalBalance(entry.type), entry.description ?? null, parentId ?? null]
      )
      codeToId.set(entry.code, inserted.rows[0].id)
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
