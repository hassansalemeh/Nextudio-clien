// Proves, against the REAL schema (including this task's two draft migrations) running in an isolated
// in-memory PostgreSQL, that:
//   1. A representative sample of this importer's resolved historical journal entries can be written through
//      the live posting model's own tables/guards (EQ-OPENING kind guard, LIA-CLIENTFUNDS project+fund guard)
//      without any special-casing.
//   2. Re-inserting the SAME legacy line a second time (simulating a re-run of a real import) is rejected by
//      the accounting_legacy_journal_line_ref unique constraint, not by application logic - i.e. duplicate
//      legacy IDs cannot be inserted twice even if the importer's own in-memory idempotency check were buggy.
//   3. Production is structurally unreachable: pool.query/pool.connect are hijacked to throw before any
//      application code runs, exactly like accounting-local-test.ts.
//
// This is a MECHANISM test, not a real import: the one LIA-CLIENTFUNDS-shaped sample below exists only to
// prove the guard's plumbing works, and does not represent an approved State House Facade Revival -> DNT
// mapping (that mapping is proposed-only per the historical-import report; nothing here writes to production
// or to any real book).
//
//   npx tsx tools/one-off/legacy-import/test-write-path.ts
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
  process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/legacy_import_write_path_test'
  const db = new PGlite({ extensions: { btree_gist }, parsers: { 20: (v) => v, 1700: (v) => v } })
  const { pool } = await import('../../../src/db')
  pool.connect = (() => { throw new Error('Network database access is forbidden in this test harness') }) as typeof pool.connect
  pool.query = (() => { throw new Error('Network database access is forbidden in this test harness') }) as typeof pool.query
  ok('production pool.query/pool.connect are hijacked before any application code runs (requirement 10: cannot write to production)')

  const q = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => db.query<T>(sql, params)

  try {
    const directory = path.resolve(__dirname, '../../../../supabase/migrations')
    const files = fs.readdirSync(directory).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) await db.exec(fs.readFileSync(path.join(directory, file), 'utf8'))
    ok(`loaded all ${files.length} repository migrations (including the two draft legacy-import migrations) into isolated in-memory PostgreSQL with zero errors`)

    const bookId = 1 // NEXTUDIO, seeded by accounting_seed_books.sql
    const admin = (await q<{ id: number }>(`insert into app_users (email, password_hash, role) values ('test-admin@local', 'x', 'admin') returning id`)).rows[0]

    // Minimal chart: reuse the live codes plus a HIST-* leaf, exactly as accounting-seed-chart.ts would create them.
    const acct = async (code: string, name: string, type: string, parentCode?: string) => {
      const parentId = parentCode ? (await q<{ id: number }>(`select id from accounting_accounts where book_id = $1 and code = $2`, [bookId, parentCode])).rows[0]?.id : null
      const normal = type === 'asset' || type === 'expense' ? 'debit' : 'credit'
      const r = await q<{ id: number }>(
        `insert into accounting_accounts (book_id, code, name, type, normal_balance, parent_id) values ($1,$2,$3,$4,$5,$6) returning id`,
        [bookId, code, name, type, normal, parentId ?? null]
      )
      return r.rows[0].id
    }
    const eqOpening = await acct('EQ-OPENING', 'Opening Balance Equity', 'equity')
    const liaPartner = await acct('LIA-PARTNER', 'Partner Current/Funding Accounts', 'liability')
    const histRoot = await acct('HIST-AST-ROOT', 'Legacy Unclassified Assets (review required)', 'asset')
    const histLeaf = await acct('HIST-46190001', 'Legacy: Malek Nawfal (historical - review required)', 'asset', 'HIST-AST-ROOT')
    const astCash = await acct('AST-CASH', 'Cash', 'asset')
    ok('created a minimal chart including a HIST-*-ROOT grouping account and one named historical leaf, exactly as accounting-seed-chart.ts (extended for this task) would')
    void histRoot

    // --- Sample 1: opening_balance entry (mirrors the real "01/01/2026 Capital" legacy entry) ---
    const openingEntry = (await q<{ id: number }>(
      `insert into accounting_journal_entries (book_id, entry_date, reference, description, status, entry_kind, posted_at, posted_by_user_id)
       values ($1, '2026-01-01', 'LEGACY-NEXTUDIO-JV3', 'Legacy import: JV3', 'posted', 'opening_balance', now(), $2) returning id`,
      [bookId, admin.id]
    )).rows[0]
    await q(`insert into accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit) values ($1,$2,$3,$4,0)`, [openingEntry.id, bookId, liaPartner, 15000])
    const line2 = await q<{ id: number }>(`insert into accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit) values ($1,$2,$3,0,$4) returning id`, [openingEntry.id, bookId, eqOpening, 15000])
    await q(
      `insert into accounting_legacy_journal_line_ref (journal_line_id, legacy_book_code, legacy_jv_id, legacy_voucher_entry_id, legacy_account_id, legacy_base1_amount, legacy_base2_amount, legacy_fx_rate)
       values ($1, 'NEXTUDIO', 3, 8, 924, 15000, 1350000000, 90000)`,
      [line2.rows[0].id]
    )
    ok('wrote a real opening_balance journal entry (EQ-OPENING guard satisfied) with its legacy line-ref row (JVID 3, VoucherEntryID 8)')

    // --- Sample 2: standard entry posting to the historical sub-account ---
    const histEntry = (await q<{ id: number }>(
      `insert into accounting_journal_entries (book_id, entry_date, reference, description, status, entry_kind, posted_at, posted_by_user_id)
       values ($1, '2026-03-01', 'LEGACY-NEXTUDIO-JV999', 'Legacy import: JV999', 'posted', 'standard', now(), $2) returning id`,
      [bookId, admin.id]
    )).rows[0]
    await q(`insert into accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit) values ($1,$2,$3,$4,0)`, [histEntry.id, bookId, histLeaf, 1000])
    const histLine2 = await q<{ id: number }>(`insert into accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit) values ($1,$2,$3,0,$4) returning id`, [histEntry.id, bookId, astCash, 1000])
    await q(
      `insert into accounting_legacy_journal_line_ref (journal_line_id, legacy_book_code, legacy_jv_id, legacy_voucher_entry_id, legacy_account_id, legacy_base1_amount)
       values ($1, 'NEXTUDIO', 999, 12345, 947, 1000)`,
      [histLine2.rows[0].id]
    )
    ok('wrote a standard entry posting to a named historical sub-account (HIST-46190001) - the requirement-2/3 preservation path')

    // --- Duplicate-prevention proof: re-insert the SAME legacy_voucher_entry_id ---
    let rejected = false
    try {
      const dupLine = (await q<{ id: number }>(`insert into accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit) values ($1,$2,$3,0,$4) returning id`, [histEntry.id, bookId, astCash, 1000])).rows[0]
      await q(
        `insert into accounting_legacy_journal_line_ref (journal_line_id, legacy_book_code, legacy_jv_id, legacy_voucher_entry_id, legacy_account_id, legacy_base1_amount)
         values ($1, 'NEXTUDIO', 999, 12345, 947, 1000)`, // same legacy_voucher_entry_id = 12345 as above
        [dupLine.id]
      )
    } catch (err) {
      rejected = (err as Error).message.toLowerCase().includes('duplicate') || (err as Error).message.toLowerCase().includes('unique')
    }
    assert.strictEqual(rejected, true, 'a duplicate legacy_voucher_entry_id must be rejected by the database unique constraint')
    ok('duplicate legacy_voucher_entry_id (12345) rejected by the accounting_legacy_journal_line_ref unique constraint (requirement 10: cannot insert twice)')

    // --- Guard mechanism check (not a real mapping): LIA-CLIENTFUNDS requires project_id + a matching fund ---
    const liaClientFunds = await acct('LIA-CLIENTFUNDS', 'Client Project Funds / Funds Held for Projects', 'liability')
    const client = (await q<{ id: number }>(`insert into clients (name) values ('Test Client') returning id`)).rows[0]
    const project = (await q<{ id: number }>(`insert into projects (client_id, name, total_fee) values ($1, 'TESTPROJ', 0) returning id`, [client.id])).rows[0]
    let guardFired = false
    try {
      const badEntry = (await q<{ id: number }>(`insert into accounting_journal_entries (book_id, entry_date, status, entry_kind) values ($1, '2026-01-01', 'posted', 'standard') returning id`, [bookId])).rows[0]
      await q(`insert into accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit, project_id) values ($1,$2,$3,100,0,$4)`, [badEntry.id, bookId, liaClientFunds, project.id])
    } catch (err) {
      guardFired = (err as Error).message.includes('LIA-CLIENTFUNDS')
    }
    assert.strictEqual(guardFired, true, 'LIA-CLIENTFUNDS without an associated project_fund cash account must be rejected')
    ok('confirmed the LIVE LIA-CLIENTFUNDS guard (from 20261018000000_accounting_protected_posting_paths.sql) rejects a posting with no project_fund - the mechanism a real client_project_funds_held import line would go through is exercised and correct, independent of any specific project mapping decision')

    console.log(`\n${passed} checks passed. This ran entirely in isolated in-memory PostgreSQL - production was never connected.`)
  } finally {
    await db.close()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
