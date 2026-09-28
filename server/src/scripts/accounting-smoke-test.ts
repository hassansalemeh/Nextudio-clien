// Verifies the accounting posting engine's hard invariants directly against the real schema, without ever
// committing anything: everything runs inside one BEGIN...ROLLBACK on a single connection. postTransaction()
// and reverseJournalEntry() are called with that same connection injected, so they never open their own
// transaction (which would COMMIT). Run only against an isolated local database; sequences are not rolled back.
//
//   npm run test:accounting
//
// Requires all accounting migrations through 20261018000000 on the local database.
// Prefer npm run test:accounting-local, which loads the repository migrations into isolated memory.
import assert from 'assert'
import type { PoolClient } from 'pg'
import type { OpeningBalanceInput, PostTransactionInput } from '../accounting/types'
import { pool } from '../db'
import { createProjectFundLedgerAccount } from '../accounting/cashAccountsRoutes'
import { EXCLUDE_REVERSAL_PAIRS_SQL } from '../accounting/helpers'
import * as postingService from '../accounting/postingService'
import { postOpeningBalance, postTransaction, reverseJournalEntry } from '../accounting/postingService'
import { accountBalance, cashAccountBalance, payeeTotals, projectClientDisbursements, projectSpendByCategory, projectTotals, trialBalance } from '../accounting/queries'
import { testProtectedPostingPaths } from './accounting-protected-posting-test'

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
  clientId: string
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
    counterparty: counterparty.id, project: project.id, clientId: testClient.id, userId: user.id,
  }
}

export async function runAccountingSmokeTests(client: PoolClient) {
  passed = 0
  try {
    await client.query('BEGIN')
    const fx = await createFixtures(client)

    // 1. Balanced journal creation
    const posted = await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_out', transaction_date: '2026-01-01', amount: 100, currency_code: 'USD', exchange_rate: null,
        description: 'Concrete labor payment', reference: null, project_id: fx.project, counterparty_id: fx.counterparty,
        category_account_id: fx.expenseAccount, from_cash_account_id: fx.cash, to_cash_account_id: null, contra_account_id: null, classification_account_id: null, created_by_user_id: fx.userId,
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
          category_account_id: fx.expenseAccount, from_cash_account_id: fx.bookBCash, to_cash_account_id: null, contra_account_id: null, classification_account_id: null, created_by_user_id: fx.userId,
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
        category_account_id: fx.expenseAccount, from_cash_account_id: fx.cash, to_cash_account_id: null, contra_account_id: null, classification_account_id: null, created_by_user_id: fx.userId,
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
        category_account_id: fx.expenseAccount, from_cash_account_id: fx.cash, to_cash_account_id: null, contra_account_id: null, classification_account_id: null, created_by_user_id: fx.userId,
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
        category_account_id: fx.liabilityAccount, from_cash_account_id: null, to_cash_account_id: fx.cash, contra_account_id: null, classification_account_id: null, created_by_user_id: fx.userId,
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
        category_account_id: null, from_cash_account_id: fx.cash, to_cash_account_id: fx.pettyCash, contra_account_id: null, classification_account_id: null, created_by_user_id: fx.userId,
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
      ['parsePostTransactionInput', 'postTransaction', 'reverseJournalEntry', 'reverseTransaction',
        'parseOpeningBalanceInput', 'postOpeningBalance', 'OPENING_BALANCE_EQUITY_CODE'].sort()
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
    const computedProjectTotals = await projectTotals(client, fx.project, fx.bookA.id)
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

    // 14. Phase 1B: non-cash "incur a payable" posting, settling it later as an ordinary money_out, and
    // reversing a non-cash entry. Uses no project/counterparty so it can't disturb the totals already
    // verified above.
    const billed = await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'non_cash', transaction_date: '2026-01-06', amount: 250, currency_code: 'USD', exchange_rate: null,
        description: 'Supplier bill, not yet paid', reference: null, project_id: null, counterparty_id: null,
        category_account_id: fx.expenseAccount, from_cash_account_id: null, to_cash_account_id: null, contra_account_id: fx.liabilityAccount,
        classification_account_id: null, created_by_user_id: fx.userId,
      },
      client
    )
    const billedLines = (
      await client.query('SELECT account_id, debit, credit, cash_account_id FROM accounting_journal_lines WHERE journal_entry_id = $1 ORDER BY id', [
        billed.journalEntryId,
      ])
    ).rows
    assert.strictEqual(billedLines.length, 2)
    assert(billedLines.every((row) => row.cash_account_id === null), 'a non-cash entry must not touch any cash account')
    assert.strictEqual(Number(billedLines[0].debit), 250)
    assert.strictEqual(billedLines[0].account_id, fx.expenseAccount)
    assert.strictEqual(Number(billedLines[1].credit), 250)
    assert.strictEqual(billedLines[1].account_id, fx.liabilityAccount)
    report('non-cash "incur a payable" posting (Dr cost / Cr payable, no cash account touched)')

    // Settling that payable needs no new capability at all - it is a plain money_out whose Purpose is the
    // liability account instead of an expense account (Dr Supplier Payable / Cr Cash).
    await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_out', transaction_date: '2026-01-07', amount: 250, currency_code: 'USD', exchange_rate: null,
        description: 'Pay the supplier bill', reference: null, project_id: null, counterparty_id: null,
        category_account_id: fx.liabilityAccount, from_cash_account_id: fx.cash, to_cash_account_id: null, contra_account_id: null,
        classification_account_id: null, created_by_user_id: fx.userId,
      },
      client
    )
    const payableBalanceAfterSettling = (
      await client.query(
        `SELECT coalesce(sum(debit) - sum(credit), 0) AS net
         FROM accounting_journal_lines jl JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.account_id = $1 AND je.status = 'posted'`,
        [fx.liabilityAccount]
      )
    ).rows[0]
    // the $500 received in test 6 also credited this same liability account, so its balance isn't zero
    // overall - what matters here is that incurring (+250 credit) and settling (-250 credit, i.e. +250 debit)
    // the bill cancel each other out net, leaving only test 6's unrelated $500 behind
    assert.strictEqual(Number(payableBalanceAfterSettling.net), -500)
    report('settling a payable is an ordinary money_out; the bill itself nets to zero once paid')

    // Reversing a non-cash entry swaps which account is debited/credited, the same as every other direction
    const billReversal = await reverseJournalEntry(billed.journalEntryId, fx.userId, 'smoke test reversal', client)
    const billReversalTxn = (
      await client.query('SELECT direction, category_account_id, contra_account_id FROM accounting_transactions WHERE id = $1', [billReversal.reversalTransactionId])
    ).rows[0]
    assert.strictEqual(billReversalTxn.direction, 'non_cash')
    assert.strictEqual(billReversalTxn.category_account_id, fx.liabilityAccount)
    assert.strictEqual(billReversalTxn.contra_account_id, fx.expenseAccount)
    report('reversing a non-cash entry swaps the debit/credit accounts and stays non_cash')

    // 15. Every fund gets a dedicated ledger, including two funds for the same project.
    const projectB = (
      await client.query(`INSERT INTO projects (client_id, name, status) VALUES ($1, 'Smoke Test Project B', 'planning') RETURNING id`, [fx.clientId])
    ).rows[0]
    const group = (await client.query(`INSERT INTO accounting_accounts (book_id, code, name, type, normal_balance)
      VALUES ($1, 'AST-PROJFUND', 'Project Funds', 'asset', 'debit') RETURNING id`, [fx.bookA.id])).rows[0]
    const dntLedger = await createProjectFundLedgerAccount(client, fx.bookA.id, 'DNT Cash', fx.userId)
    const sbmLedger = await createProjectFundLedgerAccount(client, fx.bookA.id, 'SBM Cash', fx.userId)
    assert.notStrictEqual(dntLedger, sbmLedger, 'two different projects must never share one ledger account')
    const dntSecondLedger = await createProjectFundLedgerAccount(client, fx.bookA.id, 'DNT Reserve', fx.userId)
    assert.notStrictEqual(dntSecondLedger, dntLedger)
    await client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, project_id)
      VALUES ($1, 'DNT Reserve', 'project_fund', $2, $3)`, [fx.bookA.id, dntSecondLedger, fx.project])
    report('each project fund gets its own ledger, including multiple funds for one project')

    const dntFund = (
      await client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, project_id) VALUES ($1, 'DNT Cash', 'project_fund', $2, $3) RETURNING id`, [
        fx.bookA.id, dntLedger, fx.project,
      ])
    ).rows[0]
    const sbmFund = (
      await client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, project_id) VALUES ($1, 'SBM Cash', 'project_fund', $2, $3) RETURNING id`, [
        fx.bookA.id, sbmLedger, projectB.id,
      ])
    ).rows[0]
    const held = (await client.query(`INSERT INTO accounting_accounts (book_id, code, name, type, normal_balance)
      VALUES ($1, 'LIA-CLIENTFUNDS', 'Client Project Funds Held', 'liability', 'credit') RETURNING id`, [fx.bookA.id])).rows[0]
    await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_in', transaction_date: '2026-01-08', amount: 2000, currency_code: 'USD', exchange_rate: null,
        description: 'DNT client funding', reference: null, project_id: fx.project, counterparty_id: null,
        category_account_id: held.id, from_cash_account_id: null, to_cash_account_id: dntFund.id, contra_account_id: null,
        classification_account_id: null, created_by_user_id: fx.userId,
      },
      client
    )
    const dntBalance = await cashAccountBalance(client, dntFund.id)
    const sbmBalance = await cashAccountBalance(client, sbmFund.id)
    assert.strictEqual(dntBalance, 2000)
    assert.strictEqual(sbmBalance, 0, "SBM Cash must show zero - DNT's funding must never leak into another project's fund")
    assert.strictEqual(await accountBalance(client, dntLedger), 2000)
    assert.strictEqual(await accountBalance(client, sbmLedger), 0)
    assert.strictEqual(await accountBalance(client, group.id), 0)
    const fundTrial = await trialBalance(client, fx.bookA.id)
    assert.strictEqual(fundTrial.find((r) => r.account_id === dntLedger)?.balance, 2000)
    assert.strictEqual(fundTrial.find((r) => r.account_id === dntLedger)?.parent_id, group.id)
    report("DNT Cash and SBM Cash statements are fully independent - funding one never affects the other")

    // 16. Phase 1B fix #2: disbursing money already held for a client/project reduces the Client Project
    // Funds Held liability (never an expense account), while still carrying a classification tag for
    // reporting - the classification account itself is never posted to.
    const disbursement = await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_out', transaction_date: '2026-01-09', amount: 500, currency_code: 'USD', exchange_rate: null,
        description: 'Concrete labor, paid from DNT client funds', reference: null, project_id: fx.project, counterparty_id: fx.counterparty,
        category_account_id: held.id, from_cash_account_id: dntFund.id, to_cash_account_id: null, contra_account_id: null,
        classification_account_id: fx.expenseAccount, created_by_user_id: fx.userId,
      },
      client
    )
    const disbursementLines = (
      await client.query('SELECT account_id, debit, credit FROM accounting_journal_lines WHERE journal_entry_id = $1', [disbursement.journalEntryId])
    ).rows
    assert(disbursementLines.every((row) => row.account_id !== fx.expenseAccount), 'classification must never be the account actually posted to')
    assert(disbursementLines.some((row) => row.account_id === held.id && Number(row.debit) === 500), 'must debit the client-funds liability')
    const disbursementTxn = (
      await client.query('SELECT category_account_id, classification_account_id FROM accounting_transactions WHERE id = $1', [disbursement.transactionId])
    ).rows[0]
    assert.strictEqual(disbursementTxn.category_account_id, held.id)
    assert.strictEqual(disbursementTxn.classification_account_id, fx.expenseAccount)
    assert.strictEqual(await accountBalance(client, held.id), 1500)
    assert.strictEqual(await cashAccountBalance(client, dntFund.id), 1500)
    assert.strictEqual(await accountBalance(client, fx.incomeAccount), 0)
    assert.strictEqual((await projectClientDisbursements(client, fx.project, fx.bookA.id))[0].amount, 500)
    assert.strictEqual((await projectSpendByCategory(client, fx.project, fx.bookA.id))[0].amount, 200)
    assert.deepStrictEqual(await projectClientDisbursements(client, fx.project, fx.bookB.id), [])
    assert.deepStrictEqual(await projectSpendByCategory(client, fx.project, fx.bookB.id), [])
    assert.deepStrictEqual(await projectTotals(client, fx.project, fx.bookB.id), { received: 0, paid: 0 })
    report('client fund disbursement reduces the liability and retains a classification tag, never debiting an expense account')

    // 17. Phase 1B fix #3: opening balance architecture - a proper balanced journal entry against Opening
    // Balance Equity, tagged with a cash_account_id when the account belongs to a cash account, with a full
    // audit trail, and no accounting_transactions row (it isn't a "Paid To/Paid From" event).
    const openingEquity = (
      await client.query(`INSERT INTO accounting_accounts (book_id, code, name, type, normal_balance) VALUES ($1, 'EQ-OPENING', 'Opening Balance Equity', 'equity', 'credit') RETURNING id`, [
        fx.bookA.id,
      ])
    ).rows[0]
    const opening = await postOpeningBalance(
      {
        book_id: fx.bookA.id, effective_date: '2026-01-01', account_id: fx.cashAsset, amount: 1000, currency_code: 'USD',
        project_id: null, cash_account_id: fx.cash, balance_side: null, reference: 'OPEN-1', description: 'Synthetic test opening only', created_by_user_id: fx.userId,
      },
      client
    )
    const openingLines = (
      await client.query('SELECT account_id, debit, credit, cash_account_id FROM accounting_journal_lines WHERE journal_entry_id = $1 ORDER BY id', [
        opening.journalEntryId,
      ])
    ).rows
    assert.strictEqual(openingLines.length, 2)
    const cashLine = openingLines.find((row) => row.account_id === fx.cashAsset)
    const equityLine = openingLines.find((row) => row.account_id === openingEquity.id)
    assert.strictEqual(Number(cashLine.debit), 1000)
    assert.strictEqual(cashLine.cash_account_id, fx.cash, 'the cash-linked ledger account must be tagged with its cash_account_id so Cash Account Statement picks it up')
    assert.strictEqual(Number(equityLine.credit), 1000)
    const openingLinkedTxn = await client.query('SELECT id FROM accounting_transactions WHERE journal_entry_id = $1', [opening.journalEntryId])
    assert.strictEqual(openingLinkedTxn.rows.length, 0, 'an opening balance is a pure journal entry, not a Paid To/Paid From transaction')
    const openingAudit = await client.query(
      `SELECT id FROM accounting_audit_log WHERE entity_type = 'journal_entry' AND entity_id = $1 AND action = 'create'`,
      [opening.journalEntryId]
    )
    assert(openingAudit.rows.length > 0, 'an opening balance must leave an audit trail')
    report('opening balance posts a balanced entry against Opening Balance Equity, tags the cash account, and is fully audited')

    // 18. Phase 1B fix #4: accounts payable partial settlement. Bill $1,000, pay $400, $600 must remain
    // owed - and settling never debits Concrete Works a second time.
    const concreteWorks = (
      await client.query(`INSERT INTO accounting_accounts (book_id, name, type, normal_balance) VALUES ($1, 'Concrete Works', 'expense', 'debit') RETURNING id`, [fx.bookA.id])
    ).rows[0]
    const supplierPayables = (
      await client.query(`INSERT INTO accounting_accounts (book_id, name, type, normal_balance) VALUES ($1, 'Supplier Payables', 'liability', 'credit') RETURNING id`, [fx.bookA.id])
    ).rows[0]
    await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'non_cash', transaction_date: '2026-01-10', amount: 1000, currency_code: 'USD', exchange_rate: null,
        description: 'Concrete works bill', reference: null, project_id: null, counterparty_id: null,
        category_account_id: concreteWorks.id, from_cash_account_id: null, to_cash_account_id: null, contra_account_id: supplierPayables.id,
        classification_account_id: null, created_by_user_id: fx.userId,
      },
      client
    )
    await postTransaction(
      {
        book_id: fx.bookA.id, direction: 'money_out', transaction_date: '2026-01-11', amount: 400, currency_code: 'USD', exchange_rate: null,
        description: 'Partial payment on the concrete bill', reference: null, project_id: null, counterparty_id: null,
        category_account_id: supplierPayables.id, from_cash_account_id: fx.cash, to_cash_account_id: null, contra_account_id: null,
        classification_account_id: null, created_by_user_id: fx.userId,
      },
      client
    )
    const concreteNet = (
      await client.query(
        `SELECT coalesce(sum(debit) - sum(credit), 0) AS net
         FROM accounting_journal_lines jl JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.account_id = $1 AND je.status = 'posted'`,
        [concreteWorks.id]
      )
    ).rows[0]
    assert.strictEqual(Number(concreteNet.net), 1000, 'paying the bill must not debit Concrete Works a second time')
    const payablesNet = (
      await client.query(
        `SELECT coalesce(sum(credit) - sum(debit), 0) AS net
         FROM accounting_journal_lines jl JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.account_id = $1 AND je.status = 'posted'`,
        [supplierPayables.id]
      )
    ).rows[0]
    assert.strictEqual(Number(payablesNet.net), 600, 'Supplier Payables must show exactly $600 still owed')
    report('payable partial settlement: $1,000 billed, $400 paid, $600 remaining owed; Concrete Works debited exactly once')

    // Also prove settlement by supplier/project, and inspect the payment's two exact legs.
    const supplierBill: PostTransactionInput = {
      book_id: fx.bookA.id, direction: 'non_cash', transaction_date: '2026-02-01', amount: 1000,
      currency_code: 'USD', exchange_rate: null, description: 'Dimensioned bill', reference: 'SUP-100',
      project_id: projectB.id, counterparty_id: fx.counterparty, category_account_id: concreteWorks.id,
      contra_account_id: supplierPayables.id, from_cash_account_id: null, to_cash_account_id: null,
      classification_account_id: null, created_by_user_id: fx.userId,
    }
    await postTransaction(supplierBill, client)
    const supplierPayment = await postTransaction({ ...supplierBill, direction: 'money_out', amount: 400,
      category_account_id: supplierPayables.id, contra_account_id: null, from_cash_account_id: fx.cash }, client)
    const paymentLines = (await client.query('SELECT account_id, debit, credit FROM accounting_journal_lines WHERE journal_entry_id = $1 ORDER BY id', [supplierPayment.journalEntryId])).rows
    assert.deepStrictEqual(paymentLines.map((r) => [r.account_id, Number(r.debit), Number(r.credit)]), [[supplierPayables.id, 400, 0], [fx.cashAsset, 0, 400]])
    const supplierOutstanding = (await client.query(`SELECT sum(credit - debit) AS amount FROM accounting_journal_lines
      WHERE account_id = $1 AND project_id = $2 AND counterparty_id = $3`, [supplierPayables.id, projectB.id, fx.counterparty])).rows[0]
    assert.strictEqual(Number(supplierOutstanding.amount), 600)
    report('partial settlement retains supplier/project dimensions and posts exactly Dr Payables 400 / Cr Cash 400')

    // Negative paths use savepoints, preserving the outer rollback-only transaction even after SQL errors.
    const rejectsWithRollback = async (action: () => Promise<unknown>, message: RegExp) => {
      await client.query('SAVEPOINT rejected_case')
      try { await assert.rejects(action(), message) } finally { await client.query('ROLLBACK TO SAVEPOINT rejected_case') }
    }
    await rejectsWithRollback(() => client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id)
      VALUES ($1, 'Cannot share DNT ledger', 'bank', $2)`, [fx.bookA.id, dntLedger]), /cannot be shared/)
    await rejectsWithRollback(() => client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, project_id)
      VALUES ($1, 'Cannot share DNT ledger either', 'project_fund', $2, $3)`, [fx.bookA.id, dntLedger, projectB.id]), /cannot be shared/)
    await rejectsWithRollback(() => client.query('UPDATE accounting_cash_accounts SET project_id = $1 WHERE id = $2', [projectB.id, dntFund.id]), /immutable/)
    await rejectsWithRollback(() => client.query(`INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit)
      VALUES ($1, $2, $3, 10, 0)`, [posted.journalEntryId, fx.bookA.id, group.id]), /grouping account/)
    await rejectsWithRollback(() => client.query(`INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit)
      VALUES ($1, $2, $3, 10, 0)`, [posted.journalEntryId, fx.bookA.id, dntLedger]), /matching cash account/)
    report('database rejects shared fund ledgers, remapping and direct group-account postings')

    const fundPayment: PostTransactionInput = { ...supplierBill, direction: 'money_out', amount: 500,
      project_id: fx.project, category_account_id: held.id, contra_account_id: null,
      from_cash_account_id: dntFund.id, classification_account_id: fx.expenseAccount }
    await rejectsWithRollback(() => postTransaction({ ...fundPayment, project_id: projectB.id }, client), /project must match/)
    await rejectsWithRollback(() => postTransaction({ ...fundPayment, category_account_id: fx.expenseAccount }, client), /must debit Client/)
    await rejectsWithRollback(() => postTransaction({ ...fundPayment, category_account_id: sbmLedger, classification_account_id: null }, client), /cannot be a purpose/)
    await rejectsWithRollback(() => postTransaction({ ...fundPayment, classification_account_id: fx.incomeAccount }, client), /expense category/)
    await rejectsWithRollback(() => postTransaction({ ...fundPayment, counterparty_id: null }, client), /require project, payee/)
    await rejectsWithRollback(() => postTransaction({ ...fundPayment, direction: 'money_in', from_cash_account_id: null,
      to_cash_account_id: dntFund.id, category_account_id: fx.incomeAccount, classification_account_id: null }, client), /never fee income/)
    report('client-fund guards reject wrong project, expense debit, invalid classification, missing payee and fee revenue')

    const openingInput: OpeningBalanceInput = { book_id: fx.bookA.id, effective_date: '2026-01-01',
      account_id: dntLedger, cash_account_id: dntFund.id, balance_side: 'debit', amount: 123,
      currency_code: 'USD', project_id: fx.project, reference: 'TEST-OPEN-DNT', description: 'Synthetic opening only', created_by_user_id: fx.userId }
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, account_id: fx.expenseAccount }, client), /cannot post to income or expense/)
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, account_id: fx.incomeAccount }, client), /cannot post to income or expense/)
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, account_id: group.id }, client), /grouping account/)
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, currency_code: 'EUR' }, client), /currency must match/)
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, project_id: projectB.id }, client), /project must match/)
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, cash_account_id: fx.cash }, client), /selected ledger account/)
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, account_id: fx.cashAsset, cash_account_id: null }, client), /specific cash account/)
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, reference: null }, client), /source reference/)
    await rejectsWithRollback(() => postOpeningBalance({ ...openingInput, amount: 0.001 }, client), /at least 0.01/)
    await rejectsWithRollback(async () => {
      await client.query('UPDATE accounting_accounts SET is_active = false WHERE id = $1', [openingEquity.id])
      await postOpeningBalance(openingInput, client)
    }, /no EQ-OPENING/)
    report('opening guards reject P&L, group, wrong currency/project/fund, ambiguous cash, missing reference, tiny amount and inactive equity')

    const fundOpening = await postOpeningBalance(openingInput, client)
    const openingMetadata = (await client.query(`SELECT currency_code, entry_kind, entry_date::text AS effective_date, reference,
      posted_by_user_id FROM accounting_journal_entries WHERE id = $1`, [fundOpening.journalEntryId])).rows[0]
    assert.deepStrictEqual(openingMetadata, { currency_code: 'USD', entry_kind: 'opening_balance',
      effective_date: '2026-01-01', reference: 'TEST-OPEN-DNT', posted_by_user_id: fx.userId })
    assert.strictEqual(await cashAccountBalance(client, dntFund.id), 1623)
    await rejectsWithRollback(() => postOpeningBalance(openingInput, client), /unique constraint/)
    const openingReversal = await reverseJournalEntry(fundOpening.journalEntryId, fx.userId, 'Synthetic reversal', client)
    assert.strictEqual(await cashAccountBalance(client, dntFund.id), 1500)
    assert.strictEqual((await client.query('SELECT currency_code FROM accounting_journal_entries WHERE id = $1', [openingReversal.reversalEntryId])).rows[0].currency_code, 'USD')
    const creditOpening = await postOpeningBalance({ ...openingInput, balance_side: 'credit', reference: 'TEST-OVERDRAFT' }, client)
    assert.strictEqual(await cashAccountBalance(client, dntFund.id), 1377)
    await reverseJournalEntry(creditOpening.journalEntryId, fx.userId, 'Synthetic reversal', client)
    const receivables = (await client.query(`INSERT INTO accounting_accounts (book_id, name, type, normal_balance)
      VALUES ($1, 'Opening Receivables', 'asset', 'debit') RETURNING id`, [fx.bookA.id])).rows[0]
    await postOpeningBalance({ ...openingInput, account_id: receivables.id, cash_account_id: null, reference: 'TEST-RECEIVABLES' }, client)
    assert.strictEqual((await projectSpendByCategory(client, fx.project, fx.bookA.id))[0].amount, 200)
    assert.strictEqual((await projectSpendByCategory(client, fx.project, fx.bookA.id)).length, 1)
    report('opening metadata persists; duplicate reference is rejected; debit/credit openings and reversals reconcile')

    await reverseJournalEntry(disbursement.journalEntryId, fx.userId, 'Synthetic correction', client)
    assert.deepStrictEqual(await projectClientDisbursements(client, fx.project, fx.bookA.id), [])
    assert.strictEqual(await cashAccountBalance(client, dntFund.id), 2000)
    assert.strictEqual(await accountBalance(client, held.id), 2000)
    report('client disbursement reversal restores liability/cash and removes the corrected pair from classification totals')

    await testProtectedPostingPaths(client, {
      bookId: fx.bookA.id, otherBookId: fx.bookB.id, projectId: fx.project, clientId: fx.clientId, userId: fx.userId,
      cashId: fx.cash, fundId: dntFund.id, expenseId: fx.expenseAccount, heldId: held.id, equityId: openingEquity.id, payeeId: fx.counterparty,
    }, report)

    console.log(`\n${passed} checks passed. Rolling back all test rows.`)
  } finally {
    await client.query('ROLLBACK')
  }
}

async function main() {
  const hostname = new URL(process.env.DATABASE_URL!).hostname
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    throw new Error('Smoke tests require a local database. Use npm run test:accounting-local for an isolated in-memory database.')
  }
  const client = await pool.connect()
  try { await runAccountingSmokeTests(client) } finally { client.release() }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`\nFAILED after ${passed} checks:`, err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
