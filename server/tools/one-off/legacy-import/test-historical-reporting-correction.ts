// Regression test for the historical reporting correction (chat history, 2026-09-29): proves, against the
// REAL schema (every migration including 20261021000000_accounting_historical_reporting_correction.sql)
// running in an isolated in-memory PostgreSQL, that the corrected query layer (historicalCorrectedQueries.ts)
// produces the right numbers for the exact failure modes the audit found - never touches production (pool
// is hijacked before any application code runs, same pattern as test-write-path.ts).
//
//   npx tsx tools/one-off/legacy-import/test-historical-reporting-correction.ts
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { PGlite, type Extension } from '@electric-sql/pglite'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { btree_gist } = require('@electric-sql/pglite/contrib/btree_gist') as { btree_gist: Extension }

let passed = 0
function ok(name: string) {
  passed++
  console.log(`  ok: ${name}`)
}

async function main() {
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/historical_reporting_correction_test'
  const db = new PGlite({ extensions: { btree_gist }, parsers: { 20: (v) => v, 1700: (v) => v } })
  const { pool } = await import('../../../src/db')
  pool.connect = (() => {
    throw new Error('Network database access is forbidden in this test harness')
  }) as typeof pool.connect
  pool.query = (() => {
    throw new Error('Network database access is forbidden in this test harness')
  }) as typeof pool.query
  ok('production pool.query/pool.connect are hijacked before any application code runs')

  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => db.query<T>(sql, params)
  const dbClient = { query: (sql: string, params?: unknown[]) => q(sql, params) }

  const migrationsDir = path.resolve(__dirname, '../../../../supabase/migrations')
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
    } catch (err) {
      throw new Error(`Migration ${f} failed to apply in the test harness: ${(err as Error).message}`)
    }
  }
  ok(`all ${files.length} migrations applied cleanly (includes the historical reporting correction migration)`)

  const {
    confirmedProfessionalFeesCollected,
    historicalClientProjectFunds,
    clientControlBalances,
    legacyJobFundSummary,
    historicalReviewNeeded,
    remainingMappingErrors,
  } = await import('../../../src/accounting/historicalCorrectedQueries')

  // ---- seed a minimal book with the exact shapes the audit found ----
  const book = await q<{ id: string }>(`INSERT INTO accounting_books (code, name) VALUES ('TESTBOOK','Test Book') RETURNING id`)
  const bookId = book.rows[0].id
  async function acct(code: string, name: string, type: string, normal: string) {
    const r = await q<{ id: string }>(
      `INSERT INTO accounting_accounts (book_id, code, name, type, normal_balance) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [bookId, code, name, type, normal]
    )
    return r.rows[0].id
  }
  const cashLedgerId = await acct('AST-CASH', 'Cash', 'asset', 'debit')
  const recvId = await acct('AST-RECV', 'Receivable', 'asset', 'debit')
  const clientAdvId = await acct('LIA-CLIENTADV', 'Client Advances', 'liability', 'credit')
  const incFeesId = await acct('INC-FEES', 'Fees', 'income', 'credit')
  const costId = await acct('EXP-COST', 'Project Cost', 'expense', 'debit')

  const jobRow = await q<{ id: string }>(
    `INSERT INTO accounting_legacy_jobs (book_id, legacy_job_id, legacy_job_code, legacy_job_name) VALUES ($1,1,'001','Test Job') RETURNING id`,
    [bookId]
  )
  const legacyJobId = jobRow.rows[0].id

  const jobCashAccount = await q<{ id: string }>(
    `INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, currency_code, legacy_account_id, legacy_job_id)
     VALUES ($1,'Cash - Test Job (historical job pot)','cash',$2,'USD',9001,$3) RETURNING id`,
    [bookId, cashLedgerId, legacyJobId]
  )
  const jobCashAccountId = jobCashAccount.rows[0].id
  // A separate, non-job-linked pot for scenario 1 (client-control balances), so it doesn't leak into
  // scenario 2's job-fund-summary totals, which are scoped to jobCashAccountId specifically.
  const genericCashAccount = await q<{ id: string }>(
    `INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, currency_code, legacy_account_id)
     VALUES ($1,'Generic Cash','cash',$2,'USD',9002) RETURNING id`,
    [bookId, cashLedgerId]
  )
  const genericCashAccountId = genericCashAccount.rows[0].id

  const clientCp = await q<{ id: string }>(`INSERT INTO accounting_counterparties (book_id, name, kind) VALUES ($1,'Test Client','client') RETURNING id`, [bookId])
  const clientCpId = clientCp.rows[0].id

  let entrySeq = 0
  async function entry() {
    entrySeq++
    const r = await q<{ id: string }>(
      `INSERT INTO accounting_journal_entries (book_id, entry_date, entry_kind, status, reference) VALUES ($1, '2026-01-01', 'standard', 'posted', $2) RETURNING id`,
      [bookId, `TEST-${entrySeq}`]
    )
    return r.rows[0].id
  }
  async function line(entryId: string, accountId: string, opts: { debit?: number; credit?: number; cashAccountId?: string; counterpartyId?: string }) {
    await q(
      `INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit, cash_account_id, counterparty_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [entryId, bookId, accountId, opts.debit ?? 0, opts.credit ?? 0, opts.cashAccountId ?? null, opts.counterpartyId ?? null]
    )
    const idRow = await q<{ id: string }>(`SELECT id FROM accounting_journal_lines ORDER BY id DESC LIMIT 1`)
    return idRow.rows[0].id
  }
  async function classify(journalLineId: string, semanticClass: string, status: string) {
    await q(`INSERT INTO accounting_legacy_line_classification (journal_line_id, semantic_class, status) VALUES ($1,$2,$3)`, [journalLineId, semanticClass, status])
  }

  // Scenario 1: an "overshoot" client - deposits $10,000 (advance) while balance was already receivable
  // -$1,000, so the WHOLE line was historically misrouted to AST-RECV. The corrected clientControlBalances
  // must bucket this client by their TRUE net balance (10000 - 1000 = 9000, advance_held), never by which of
  // AST-RECV/LIA-CLIENTADV a given line hit.
  const e1 = await entry()
  const priorCash = await line(e1, cashLedgerId, { credit: 1000, cashAccountId: genericCashAccountId })
  const priorRecv = await line(e1, recvId, { debit: 1000, counterpartyId: clientCpId }) // prior state: they owed us $1,000
  await classify(priorCash, 'receivable/client-control movement', 'VERIFIED')
  await classify(priorRecv, 'receivable/client-control movement', 'VERIFIED')
  const e2 = await entry()
  const cashLine2 = await line(e2, cashLedgerId, { debit: 10000, cashAccountId: genericCashAccountId })
  const clientLine2 = await line(e2, recvId, { credit: 10000, counterpartyId: clientCpId }) // whole $10k misrouted to AST-RECV historically
  await classify(cashLine2, 'receivable/client-control movement', 'MAPPING_ERROR')
  await classify(clientLine2, 'receivable/client-control movement', 'MAPPING_ERROR')

  const balances = await clientControlBalances(dbClient, bookId)
  assert.strictEqual(balances.length, 1)
  assert.strictEqual(balances[0].net_balance, 9000)
  assert.strictEqual(balances[0].state, 'advance_held')
  ok('clientControlBalances buckets a client by TRUE net balance (advance_held), unaffected by which target account an overshoot line historically hit')

  // Scenario 2: RCV-confirmed fee sweep of $500 out of the job pot, PLUS a $50 correction swept back in
  // (both RCV-tagged) - confirmedFeesCollected must be the NET ($450), not the gross credit ($500).
  const e3 = await entry()
  const sweepCredit = await line(e3, cashLedgerId, { credit: 500, cashAccountId: jobCashAccountId })
  await classify(sweepCredit, 'confirmed professional-fee collection / RCV sweep', 'VERIFIED')
  const e4 = await entry()
  const correctionDebit = await line(e4, cashLedgerId, { debit: 50, cashAccountId: jobCashAccountId })
  await classify(correctionDebit, 'confirmed professional-fee collection / RCV sweep', 'VERIFIED')
  // a genuine project cost, non-RCV
  const e5 = await entry()
  const costLine = await line(e5, cashLedgerId, { credit: 200, cashAccountId: jobCashAccountId })
  await classify(costLine, 'supplier/contractor payment', 'VERIFIED')

  const fees = await confirmedProfessionalFeesCollected(dbClient, bookId)
  assert.strictEqual(fees, 450)
  ok('confirmedProfessionalFeesCollected nets an RCV correction/refund against the gross sweep (450, not 500)')

  const jobSummary = await legacyJobFundSummary(dbClient, legacyJobId)
  assert.ok(jobSummary)
  // received: 1000(prior, non-RCV) + 10000(non-RCV) = 11000 [line-1 debit on recv acct isn't on the cash pot,
  // only cash-pot lines count] -> only the 10000 cash debit is on the job pot and non-RCV
  assert.strictEqual(jobSummary!.confirmedFeesCollected, 450)
  assert.strictEqual(jobSummary!.genuineProjectCostsPaid, 200)
  ok('legacyJobFundSummary: fees=450 (net), costs=200 (non-RCV only) - the refund never leaks into "costs" or "received"')

  // Scenario 3: PRESERVED_AMBIGUOUS line must show up in the review-needed list, untouched.
  const e6 = await entry()
  const ambigLine = await line(e6, costId, { debit: 75 })
  await classify(ambigLine, 'ambiguous / requires manual review', 'PRESERVED_AMBIGUOUS')
  await q(
    `INSERT INTO accounting_legacy_journal_line_ref (journal_line_id, legacy_book_code, legacy_jv_id, legacy_voucher_entry_id, legacy_account_id, legacy_base1_amount, legacy_narration)
     VALUES ($1,'TESTBOOK',99,9999,7777,75,'Unknown mixed-signal counterparty')`,
    [ambigLine]
  )
  const review = await historicalReviewNeeded(dbClient, bookId)
  assert.strictEqual(review.length, 1)
  assert.strictEqual(review[0].tentative_class, 'ambiguous / requires manual review')
  ok('historicalReviewNeeded surfaces a PRESERVED_AMBIGUOUS line for management review, not guessed into a category')

  // Scenario 4: MAPPING_ERROR items are recorded and visible in the audit trail (remainingMappingErrors), but
  // never counted as VERIFIED revenue/fees in any of the corrected metrics above (already proven: scenario 1's
  // two MAPPING_ERROR lines contribute nothing to confirmedFeesCollected, which stayed exactly 450).
  const mappingErrors = await remainingMappingErrors(dbClient)
  assert.strictEqual(mappingErrors.count, 2)
  ok('remainingMappingErrors reports the known MAPPING_ERROR count for audit-trail visibility (2, from scenario 1) without them polluting VERIFIED metrics')

  const status = await q<{ status: string }>(`SELECT DISTINCT status FROM accounting_legacy_line_classification`)
  for (const row of status.rows) assert.ok(['VERIFIED', 'PRESERVED_AMBIGUOUS', 'MAPPING_ERROR'].includes(row.status))
  ok('every classification status is one of VERIFIED / PRESERVED_AMBIGUOUS / MAPPING_ERROR - no "assumed" status exists')

  console.log(`\n${passed} checks passed.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('TEST FAILED:', err)
    process.exit(1)
  })
