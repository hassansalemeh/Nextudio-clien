// Verifies the accounting posting engine's hard invariants directly against the real schema, without ever
// committing anything: everything runs inside one BEGIN...ROLLBACK on a single connection. postTransaction()
// and reverseJournalEntry() are called with that same connection injected, so they never open their own
// transaction (which would COMMIT) - this is what makes it safe to run against the production database.
//
//   npm run test:accounting
//
// Requires the accounting schema migrations to already be applied (this only verifies application logic,
// not the schema itself) - see supabase/migrations/20261013000000_accounting_schema.sql and
// 20261014000000_accounting_seed_books.sql.
import assert from 'assert'
import type { PoolClient } from 'pg'
import { pool } from '../db'
import { EXCLUDE_REVERSAL_PAIRS_SQL } from '../accounting/helpers'
import * as postingService from '../accounting/postingService'
import { postTransaction, reverseJournalEntry } from '../accounting/postingService'
import { payeeTotals, projectTotals } from '../accounting/queries'

let passed = 0
function report(name: string) {
  passed++
  console.log(`  ok: ${name}`)
}

type Fixtures = {
  bookA: { id: string; code: string }
  bookB: { id: string; code: string }
  cashAsset: string
  expenseAccount: string
  incomeAccount: string
  liabilityAccount: string
  cash: string
  pettyCash: string
  bookBCash: string
  counterparty: string
  project: string
  userId: string
}

async function createFixtures(client: PoolClient): Promise<Fixtures> {
  const user = (
    await client.query(
      `INSERT INTO app_users (email, password_hash, role) VALUES ('smoke-test@nextudio.local', 'x', 'admin') RETURNING id`
    )
  ).rows[0]
  const testClient = (await client.query(`INSERT INTO clients (name) VALUES ('Smoke Test Client') RETURNING id`)).rows[0]
  const project = (
    await client.query(`INSERT INTO projects (client_id, name, status) VALUES ($1, 'Smoke Test Project', 'planning') RETURNING id`, [testClient.id])
  ).rows[0]

  const bookA = (await client.query(`INSERT INTO accounting_books (code, name) VALUES ('SMOKE_A', 'Smoke Test A') RETURNING id, code`)).rows[0]
  const bookB = (await client.query(`INSERT INTO accounting_books (code, name) VALUES ('SMOKE_B', 'Smoke Test B') RETURNING id, code`)).rows[0]

  const cashAsset = (
    await client.query(`INSERT INTO accounting_accounts (book_id, name, type, normal_balance) VALUES ($1, 'Cash Asset', 'asset', 'debit') RETURNING id`, [bookA.id])
  ).rows[0]
  const expenseAccount = (
    await client.query(`INSERT INTO accounting_accounts (book_id, name, type, normal_balance) VALUES ($1, 'Concrete Labor', 'expense', 'debit') RETURNING id`, [bookA.id])
  ).rows[0]
  const incomeAccount = (
    await client.query(`INSERT INTO accounting_accounts (book_id, name, type, normal_balance) VALUES ($1, 'Design Fee Income', 'income', 'credit') RETURNING id`, [bookA.id])
  ).rows[0]
  const liabilityAccount = (
    await client.query(`INSERT INTO accounting_accounts (book_id, name, type, normal_balance) VALUES ($1, 'Client Funds Held', 'liability', 'credit') RETURNING id`, [bookA.id])
  ).rows[0]
  const cash = (
    await client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id) VALUES ($1, 'Main Cash', 'cash', $2) RETURNING id`, [bookA.id, cashAsset.id])
  ).rows[0]
  const pettyCash = (
    await client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id) VALUES ($1, 'Petty Cash', 'petty_cash', $2) RETURNING id`, [bookA.id, cashAsset.id])
  ).rows[0]
  const counterparty = (
    await client.query(`INSERT INTO accounting_counterparties (book_id, name, kind) VALUES ($1, 'Ahmad', 'worker') RETURNING id`, [bookA.id])
  ).rows[0]

  // A cash account that belongs to book B, used to prove cross-book references are rejected
  const bookBAsset = (
    await client.query(`INSERT INTO accounting_accounts (book_id, name, type, normal_balance) VALUES ($1, 'Book B Cash Asset', 'asset', 'debit') RETURNING id`, [bookB.id])
  ).rows[0]
  const bookBCash = (
    await client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id) VALUES ($1, 'Book B Cash', 'cash', $2) RETURNING id`, [bookB.id, bookBAsset.id])
  ).rows[0]

  return {
    bookA, bookB, cashAsset: cashAsset.id, expenseAccount: expenseAccount.id, incomeAccount: incomeAccount.id,
    liabilityAccount: liabilityAccount.id, cash: cash.id, pettyCash: pettyCash.id, bookBCash: bookBCash.id,
    counterparty: counterparty.id, project: project.id, userId: user.id,
  }
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const fx = await createFixtures(client)

    // 1. Balanced journal creation
    const posted = await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_out', transaction_date: '2026-01-01', amount: 100, currency_code: 'USD', exchange_rate: null,
        description: 'Concrete labor payment', reference: null, project_id: fx.project, counterparty_id: fx.counterparty,
        category_account_id: fx.expenseAccount, from_cash_account_id: fx.cash, to_cash_account_id: null, created_by_user_id: fx.userId,
      },
      client
    )
    const lines1 = (await client.query('SELECT debit, credit FROM accounting_journal_lines WHERE journal_entry_id = $1', [posted.journalEntryId])).rows
    const debitSum1 = lines1.reduce((sum, row) => sum + Number(row.debit), 0)
    const creditSum1 = lines1.reduce((sum, row) => sum + Number(row.credit), 0)
    assert.strictEqual(lines1.length, 2)
    assert.strictEqual(debitSum1, creditSum1)
    assert.strictEqual(debitSum1, 100)
    report('balanced journal creation')

    // 2. Reject unbalanced journal: the DB has no cross-row (entry-level) balance constraint - it only
    // constrains the SHAPE of a single line (exactly one side nonzero). Two things to prove:
    //   a) the DB does reject a single line that violates its own shape constraints
    //   b) the DB does NOT reject an entry whose two lines don't balance, if inserted directly -
    //      which is exactly why the posting service must be the only code path that ever writes here.
    const bareEntry = (
      await client.query(`INSERT INTO accounting_journal_entries (book_id, entry_date, status) VALUES ($1, current_date, 'posted') RETURNING id`, [fx.bookA.id])
    ).rows[0]
    // A failed statement aborts the whole enclosing Postgres transaction, not just itself - wrapping this
    // intentionally-failing INSERT in a SAVEPOINT lets the rest of this script's single outer transaction
    // keep going afterward (ROLLBACK TO SAVEPOINT undoes only the failed attempt, not everything before it).
    await client.query('SAVEPOINT before_bad_line')
    await assert.rejects(
      client.query('INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit) VALUES ($1, $2, $3, 10, 10)', [
        bareEntry.id, fx.bookA.id, fx.expenseAccount,
      ]),
      /constraint/i,
      'a line with both debit and credit set should violate the check constraint'
    )
    await client.query('ROLLBACK TO SAVEPOINT before_bad_line')
    await client.query(
      'INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit) VALUES ($1, $2, $3, 10, 0)',
      [bareEntry.id, fx.bookA.id, fx.expenseAccount]
    )
    await client.query(
      'INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit) VALUES ($1, $2, $3, 0, 999)',
      [bareEntry.id, fx.bookA.id, fx.cashAsset]
    )
    const bareTotals = (
      await client.query('SELECT sum(debit) AS d, sum(credit) AS c FROM accounting_journal_lines WHERE journal_entry_id = $1', [bareEntry.id])
    ).rows[0]
    assert.notStrictEqual(Number(bareTotals.d), Number(bareTotals.c), 'the DB allowed an unbalanced entry when the service was bypassed, as expected')
    report('reject unbalanced journal (DB rejects bad line shape; only the service enforces entry-level balance)')

    // 3. Cross-book references rejected, at both the service layer and the raw DB layer
    await assert.rejects(
      postTransaction(
        {
          book_id: fx.bookA.id, direction: 'money_out', transaction_date: '2026-01-01', amount: 50, currency_code: 'USD', exchange_rate: null,
          description: null, reference: null, project_id: null, counterparty_id: null,
          category_account_id: fx.expenseAccount, from_cash_account_id: fx.bookBCash, to_cash_account_id: null, created_by_user_id: fx.userId,
        },
        client
      ),
      /does not exist in this book/
    )
    await client.query('SAVEPOINT before_cross_book_insert')
    await assert.rejects(
      client.query(
        `INSERT INTO accounting_transactions (book_id, direction, status, transaction_date, amount, category_account_id, from_cash_account_id, created_by_user_id)
         VALUES ($1, 'money_out', 'posted', current_date, 50, $2, $3, $4)`,
        [fx.bookA.id, fx.expenseAccount, fx.bookBCash, fx.userId]
      ),
      /foreign key/i,
      'the composite foreign key should reject a cash account from a different book, even bypassing the service'
    )
    await client.query('ROLLBACK TO SAVEPOINT before_cross_book_insert')
    report('cross-book references rejected')

    // 4. Project expense posting
    const projectExpense = await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_out', transaction_date: '2026-01-02', amount: 200, currency_code: 'USD', exchange_rate: null,
        description: 'Materials', reference: null, project_id: fx.project, counterparty_id: fx.counterparty,
        category_account_id: fx.expenseAccount, from_cash_account_id: fx.cash, to_cash_account_id: null, created_by_user_id: fx.userId,
      },
      client
    )
    const categoryLine = (
      await client.query('SELECT project_id, counterparty_id FROM accounting_journal_lines WHERE journal_entry_id = $1 AND account_id = $2', [
        projectExpense.journalEntryId, fx.expenseAccount,
      ])
    ).rows[0]
    assert.strictEqual(categoryLine.project_id, fx.project)
    assert.strictEqual(categoryLine.counterparty_id, fx.counterparty)
    report('project expense posting')

    // 5. Company expense posting (no project)
    const companyExpense = await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_out', transaction_date: '2026-01-03', amount: 30, currency_code: 'USD', exchange_rate: null,
        description: 'Office supplies', reference: null, project_id: null, counterparty_id: null,
        category_account_id: fx.expenseAccount, from_cash_account_id: fx.cash, to_cash_account_id: null, created_by_user_id: fx.userId,
      },
      client
    )
    const companyTxn = (await client.query('SELECT project_id FROM accounting_transactions WHERE id = $1', [companyExpense.transactionId])).rows[0]
    assert.strictEqual(companyTxn.project_id, null)
    report('company expense posting')

    // 6. Money received posting - to a liability account, proving it does not assume revenue
    const received = await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_in', transaction_date: '2026-01-04', amount: 500, currency_code: 'USD', exchange_rate: null,
        description: 'Client funds received', reference: null, project_id: fx.project, counterparty_id: null,
        category_account_id: fx.liabilityAccount, from_cash_account_id: null, to_cash_account_id: fx.cash, created_by_user_id: fx.userId,
      },
      client
    )
    const receivedTxn = (await client.query('SELECT category_account_id FROM accounting_transactions WHERE id = $1', [received.transactionId])).rows[0]
    assert.strictEqual(receivedTxn.category_account_id, fx.liabilityAccount)
    report('money received posting (not assumed to be revenue)')

    // 7. Transfer posting
    const transfer = await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'transfer', transaction_date: '2026-01-05', amount: 75, currency_code: 'USD', exchange_rate: null,
        description: 'Move to petty cash', reference: null, project_id: null, counterparty_id: null,
        category_account_id: null, from_cash_account_id: fx.cash, to_cash_account_id: fx.pettyCash, created_by_user_id: fx.userId,
      },
      client
    )
    const transferLines = (await client.query('SELECT cash_account_id FROM accounting_journal_lines WHERE journal_entry_id = $1', [transfer.journalEntryId])).rows
    assert.strictEqual(transferLines.length, 2)
    assert(transferLines.every((row) => row.cash_account_id !== null))
    report('transfer posting')

    // 8. Transfer excluded from Money In / Money Out totals (the exact filter the dashboard route uses,
    // including the reversal-pair exclusion - a no-op at this point since nothing has been reversed yet)
    const dashboardTotals = (
      await client.query(
        `SELECT coalesce(sum(amount) FILTER (WHERE direction = 'money_in'), 0) AS money_in,
                coalesce(sum(amount) FILTER (WHERE direction = 'money_out'), 0) AS money_out
         FROM accounting_transactions t
         WHERE t.book_id = $1 AND t.status = 'posted' AND t.direction IN ('money_in', 'money_out') AND ${EXCLUDE_REVERSAL_PAIRS_SQL}`,
        [fx.bookA.id]
      )
    ).rows[0]
    // 100 (test 1) + 200 (test 4) + 30 (test 5) = 330 paid; 500 (test 6) received - the 75 transfer must not appear in either
    assert.strictEqual(Number(dashboardTotals.money_out), 330)
    assert.strictEqual(Number(dashboardTotals.money_in), 500)
    report('transfer excluded from Money In / Money Out totals')

    // 9. Posted journal cannot be edited/deleted - a structural guarantee: the posting service exports no
    // update/delete function at all, so there is no code path in the app that could ever call one.
    const exportedNames = Object.keys(postingService)
    assert.deepStrictEqual(
      exportedNames.sort(),
      ['parsePostTransactionInput', 'postTransaction', 'reverseJournalEntry', 'reverseTransaction'].sort()
    )
    report('posted journal cannot be edited/deleted (no such function exists)')

    // 10. Reversal produces an equal and opposite journal, original untouched
    const originalLines = (
      await client.query('SELECT account_id, debit, credit FROM accounting_journal_lines WHERE journal_entry_id = $1 ORDER BY id', [posted.journalEntryId])
    ).rows
    const reversal = await reverseJournalEntry(posted.journalEntryId, fx.userId, 'smoke test reversal', client)
    const reversalLines = (
      await client.query('SELECT account_id, debit, credit FROM accounting_journal_lines WHERE journal_entry_id = $1 ORDER BY id', [reversal.reversalEntryId])
    ).rows
    assert.strictEqual(reversalLines.length, originalLines.length)
    for (let i = 0; i < originalLines.length; i++) {
      assert.strictEqual(reversalLines[i].account_id, originalLines[i].account_id)
      assert.strictEqual(Number(reversalLines[i].debit), Number(originalLines[i].credit))
      assert.strictEqual(Number(reversalLines[i].credit), Number(originalLines[i].debit))
    }
    // The original entry's status stays 'posted' forever - never flips to 'reversed' - specifically so every
    // report that filters status = 'posted' keeps showing it (see the schema migration's comment on
    // accounting_journal_entries). "Reversed" is a separate fact, answered by reversal_of_entry_id existing.
    const originalAfter = (await client.query('SELECT status FROM accounting_journal_entries WHERE id = $1', [posted.journalEntryId])).rows[0]
    assert.strictEqual(originalAfter.status, 'posted')
    const reversalLookup = (
      await client.query('SELECT id FROM accounting_journal_entries WHERE reversal_of_entry_id = $1', [posted.journalEntryId])
    ).rows[0]
    assert.strictEqual(reversalLookup.id, reversal.reversalEntryId)
    const originalLinesAfter = (
      await client.query('SELECT debit, credit FROM accounting_journal_lines WHERE journal_entry_id = $1 ORDER BY id', [posted.journalEntryId])
    ).rows
    assert.deepStrictEqual(originalLinesAfter.map((r) => [Number(r.debit), Number(r.credit)]), originalLines.map((r) => [Number(r.debit), Number(r.credit)]))
    report('reversal produces an equal and opposite journal; original entry kept posted and untouched')

    // A second reversal attempt on the same entry must be rejected - detected via the existing reversal, not status
    await assert.rejects(reverseJournalEntry(posted.journalEntryId, fx.userId, null, client), /already been reversed/)
    report('a reversed entry cannot be reversed again')

    // A reversal can never itself be reversed - this keeps every reversal relationship exactly one level
    // deep, which is what makes "exclude a fully reversed pair from management totals" (below) always correct.
    await assert.rejects(reverseJournalEntry(reversal.reversalEntryId, fx.userId, null, client), /itself a reversal/)
    report('a reversal entry cannot itself be reversed')

    // 10b. Both the original entry and its reversal remain visible with status = 'posted' in a General-Journal
    // style query (the report never silently drops one of them), and their combined effect on the cash and
    // expense accounts nets to exactly zero.
    const bothEntries = await client.query(
      `SELECT id, status FROM accounting_journal_entries WHERE id IN ($1, $2) AND status = 'posted'`,
      [posted.journalEntryId, reversal.reversalEntryId]
    )
    assert.strictEqual(bothEntries.rows.length, 2)
    const netEffect = (
      await client.query(
        `SELECT coalesce(sum(debit) - sum(credit), 0) AS net
         FROM accounting_journal_lines jl JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.journal_entry_id IN ($1, $2) AND jl.account_id = $3 AND je.status = 'posted'`,
        [posted.journalEntryId, reversal.reversalEntryId, fx.cashAsset]
      )
    ).rows[0]
    assert.strictEqual(Number(netEffect.net), 0)
    report('original and reversal both remain posted and visible; their combined effect nets to zero')

    // 11. Project totals reconcile to the journal - but NOT to the raw, unfiltered journal-line sum. A
    // reversal is a correction, not a second genuine cash event, so projectTotals() (used by the Dashboard,
    // and by Project/Payee totals) must EXCLUDE both sides of test 1's now-reversed $100 pair, while the
    // journal itself keeps both fully visible (asserted separately below). The correct reconciliation target
    // is therefore the journal sum filtered to only the entries whose transaction is NOT part of a reversed
    // pair - i.e. the same journal_lines rows that "belong" to the transactions projectTotals() counts.
    const computedProjectTotals = await projectTotals(client, fx.project)
    // test 1 ($100, reversed) is excluded entirely; test 4 ($200 paid) and test 6 ($500 received) remain
    assert.strictEqual(computedProjectTotals.paid, 200)
    assert.strictEqual(computedProjectTotals.received, 500)
    const journalProjectTotals = (
      await client.query(
        `SELECT coalesce(sum(jl.debit), 0) AS paid, coalesce(sum(jl.credit), 0) AS received
         FROM accounting_journal_lines jl
         JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
         JOIN accounting_transactions t ON t.journal_entry_id = je.id
         WHERE jl.project_id = $1 AND je.status = 'posted' AND ${EXCLUDE_REVERSAL_PAIRS_SQL}`,
        [fx.project]
      )
    ).rows[0]
    assert.strictEqual(computedProjectTotals.paid, Number(journalProjectTotals.paid))
    assert.strictEqual(computedProjectTotals.received, Number(journalProjectTotals.received))
    report('project totals reconcile to the journal, excluding the reversed pair from both sides equally')

    // 12. Payee totals reconcile the same way. test 1 ($100 paid, reversed) and test 4 ($200 paid) both had
    // this counterparty; only test 4 should remain after excluding the reversed pair.
    const computedPayeeTotals = await payeeTotals(client, fx.counterparty)
    assert.strictEqual(computedPayeeTotals.paid, 200)
    assert.strictEqual(computedPayeeTotals.received, 0)
    const journalPayeeTotals = (
      await client.query(
        `SELECT coalesce(sum(jl.debit), 0) AS paid, coalesce(sum(jl.credit), 0) AS received
         FROM accounting_journal_lines jl
         JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
         JOIN accounting_transactions t ON t.journal_entry_id = je.id
         WHERE jl.counterparty_id = $1 AND je.status = 'posted' AND ${EXCLUDE_REVERSAL_PAIRS_SQL}`,
        [fx.counterparty]
      )
    ).rows[0]
    assert.strictEqual(computedPayeeTotals.paid, Number(journalPayeeTotals.paid))
    assert.strictEqual(computedPayeeTotals.received, Number(journalPayeeTotals.received))
    report('payee totals reconcile to the journal, excluding the reversed pair from both sides equally')

    // 13. The exact scenario from the spec: "DNT paid Mahmoud $500, then it was reversed" must contribute
    // zero to management totals (Dashboard Money Paid/Received, Project/Payee totals) while both entries stay
    // fully visible in Journal. Re-verify directly against test 1's $100 pair (same shape, using project/payee
    // totals already computed above) plus the book-level Dashboard-style Money In/Out totals.
    const dashboardTotalsAfterReversal = (
      await client.query(
        `SELECT coalesce(sum(amount) FILTER (WHERE direction = 'money_in'), 0) AS money_in,
                coalesce(sum(amount) FILTER (WHERE direction = 'money_out'), 0) AS money_out
         FROM accounting_transactions t
         WHERE t.book_id = $1 AND t.status = 'posted' AND t.direction IN ('money_in', 'money_out') AND ${EXCLUDE_REVERSAL_PAIRS_SQL}`,
        [fx.bookA.id]
      )
    ).rows[0]
    // Before reversal (test 8) this was 330/500; test 1's $100 must now be gone from money_out, and the
    // reversal's $100 (direction money_in) must NOT have inflated money_in - net change from test 8 is zero.
    assert.strictEqual(Number(dashboardTotalsAfterReversal.money_out), 230) // 330 - test 1's 100
    assert.strictEqual(Number(dashboardTotalsAfterReversal.money_in), 500) // unchanged - the reversal itself is excluded too
    const journalStillShowsBoth = await client.query(
      `SELECT count(*)::int AS n FROM accounting_journal_entries WHERE id IN ($1, $2) AND status = 'posted'`,
      [posted.journalEntryId, reversal.reversalEntryId]
    )
    assert.strictEqual(journalStillShowsBoth.rows[0].n, 2)
    report('a fully reversed pair contributes zero to management totals while Journal keeps showing both')

    console.log(`\n${passed} checks passed. Rolling back - nothing was written.`)
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
    client.release()
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`\nFAILED after ${passed} checks:`, err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
