// Runs inside the smoke suite's outer BEGIN/ROLLBACK. Real Express HTTP handlers use the same
// isolated connection; their transaction boundaries become savepoints, never database commits.
import assert from 'assert'
import express from 'express'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import type { PoolClient } from 'pg'
import { pool } from '../db'
import { HttpError } from '../http'
import { registerAccountingTransactionRoutes } from '../accounting/transactionsRoutes'
import { registerAccountingOpeningBalanceRoutes } from '../accounting/openingBalanceRoutes'
import { registerAccountingJournalRoutes } from '../accounting/journalRoutes'
import { postOpeningBalance, postTransaction, reverseJournalEntry } from '../accounting/postingService'
import { createProjectFundLedgerAccount } from '../accounting/cashAccountsRoutes'
import type { OpeningBalanceInput, PostTransactionInput } from '../accounting/types'

type Fixtures = {
  bookId: string; otherBookId: string; projectId: string; clientId: string; userId: string;
  cashId: string; fundId: string; expenseId: string; heldId: string; equityId: string; payeeId: string;
}

export async function testProtectedPostingPaths(client: PoolClient, fx: Fixtures, report: (name: string) => void) {
  const otherProject = (await client.query(`INSERT INTO projects (client_id, name, status)
    VALUES ($1, 'Protected Test Other Book Project', 'planning') RETURNING id`, [fx.clientId])).rows[0].id
  const otherLedger = await createProjectFundLedgerAccount(client, fx.otherBookId, 'Other Book Project Fund', fx.userId)
  await client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, project_id)
    VALUES ($1, 'Other Book Project Fund', 'project_fund', $2, $3)`, [fx.otherBookId, otherLedger, otherProject])
  const unassociatedProject = (await client.query(`INSERT INTO projects (client_id, name, status)
    VALUES ($1, 'Protected Test Unassociated Project', 'planning') RETURNING id`, [fx.clientId])).rows[0].id

  const base: PostTransactionInput = {
    book_id: fx.bookId, direction: 'money_in', transaction_date: '2026-02-01', amount: 100,
    currency_code: 'USD', exchange_rate: null, description: 'Protected account rollback test', reference: null,
    project_id: fx.projectId, counterparty_id: fx.payeeId, category_account_id: fx.heldId,
    from_cash_account_id: null, to_cash_account_id: fx.cashId, contra_account_id: null,
    classification_account_id: null, created_by_user_id: fx.userId,
  }
  const receipt = base
  const disbursement: PostTransactionInput = { ...base, direction: 'money_out', from_cash_account_id: fx.cashId,
    to_cash_account_id: null, classification_account_id: fx.expenseId }
  const bill: PostTransactionInput = { ...base, direction: 'non_cash', category_account_id: fx.expenseId,
    contra_account_id: fx.heldId, to_cash_account_id: null }
  const opening: OpeningBalanceInput = { book_id: fx.bookId, account_id: fx.heldId,
    effective_date: '2026-02-01', amount: 100, currency_code: 'USD', project_id: fx.projectId,
    cash_account_id: null, balance_side: 'credit', reference: 'PROTECTED-OPENING',
    description: 'Protected liability opening test', created_by_user_id: fx.userId }

  const reject = async (action: () => Promise<unknown>, pattern: RegExp, service = false) => {
    await client.query('SAVEPOINT protected_failure')
    try {
      await assert.rejects(action, (error: unknown) => {
        assert(error instanceof Error)
        assert.match(error.message, pattern)
        if (service) assert(error instanceof HttpError && error.status === 400, 'service must return a validation error')
        return true
      })
    } finally { await client.query('ROLLBACK TO SAVEPOINT protected_failure') }
  }

  for (const [name, input] of [['receipt', receipt], ['disbursement', disbursement], ['non-cash credit', bill]] as const) {
    for (const projectId of [null, otherProject, unassociatedProject, '9223372036854775806']) {
      await reject(() => postTransaction({ ...input, project_id: projectId }, client), /requires a project|not associated|does not exist/, true)
    }
    report(`client-funds ${name} rejects missing, other-book, unassociated and nonexistent projects`)
  }
  // Even the unsupported manual debit form validates the protected project before rejecting bill shape.
  await reject(() => postTransaction({ ...bill, category_account_id: fx.heldId, contra_account_id: fx.expenseId,
    project_id: null }, client), /requires a project/, true)
  for (const side of ['debit', 'credit'] as const) {
    for (const projectId of [null, otherProject, unassociatedProject, '9223372036854775806']) {
      await reject(() => postOpeningBalance({ ...opening, balance_side: side, project_id: projectId }, client),
        /requires a project|not associated|does not exist/, true)
    }
  }
  report('client-funds manual debit and debit/credit openings reject missing or invalid book/project attribution')

  const assertProjectOnLine = async (entryId: string) => {
    const rows = (await client.query(`SELECT project_id, book_id FROM accounting_journal_lines
      WHERE journal_entry_id = $1 AND account_id = $2`, [entryId, fx.heldId])).rows
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].project_id, fx.projectId)
    assert.strictEqual(rows[0].book_id, fx.bookId)
  }
  for (const [name, input] of [['receipt', receipt], ['disbursement', disbursement], ['non-cash', bill]] as const) {
    const posted = await postTransaction(input, client)
    await assertProjectOnLine(posted.journalEntryId)
    const reversed = await reverseJournalEntry(posted.journalEntryId, fx.userId, 'Protected test reversal', client)
    await assertProjectOnLine(reversed.reversalEntryId)
    report(`client-funds ${name} succeeds with the associated project and reversal preserves it`)
  }
  for (const side of ['debit', 'credit'] as const) {
    const posted = await postOpeningBalance({ ...opening, balance_side: side, reference: `PROTECTED-${side}` }, client)
    await assertProjectOnLine(posted.journalEntryId)
    await client.query('SAVEPOINT inactive_fund')
    try {
      await client.query(`UPDATE accounting_cash_accounts SET is_active = false WHERE book_id = $1 AND project_id = $2`, [fx.bookId, fx.projectId])
      const reversed = await reverseJournalEntry(posted.journalEntryId, fx.userId, 'Closed fund reversal', client)
      await assertProjectOnLine(reversed.reversalEntryId)
    } finally { await client.query('ROLLBACK TO SAVEPOINT inactive_fund') }
  }
  report('client-funds debit/credit openings succeed and preserve project on reversal even after fund deactivation')

  const standardEntry = (await client.query(`INSERT INTO accounting_journal_entries (book_id, entry_date)
    VALUES ($1, current_date) RETURNING id`, [fx.bookId])).rows[0].id
  for (const projectId of [null, otherProject, unassociatedProject]) {
    for (const side of ['debit', 'credit']) {
      await reject(() => client.query(`INSERT INTO accounting_journal_lines
        (journal_entry_id, book_id, account_id, project_id, ${side}) VALUES ($1, $2, $3, $4, 10)`,
      [standardEntry, fx.bookId, fx.heldId, projectId]), /requires a project|not associated/)
    }
  }
  await reject(() => client.query(`INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit)
    VALUES ($1, $2, $3, 10)`, [standardEntry, fx.bookId, fx.equityId]), /dedicated opening/)
  await reject(() => client.query(`INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id)
    VALUES ($1, 'Invalid equity cash mapping', 'cash', $2)`, [fx.bookId, fx.equityId]), /asset posting ledger/)
  const heldLine = (await client.query(`INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, project_id, debit)
    VALUES ($1, $2, $3, $4, 10) RETURNING id`, [standardEntry, fx.bookId, fx.heldId, fx.projectId])).rows[0].id
  await reject(() => client.query('UPDATE accounting_journal_lines SET project_id = null WHERE id = $1', [heldLine]), /requires a project/)
  await reject(() => client.query('DELETE FROM accounting_cash_accounts WHERE id = $1', [fx.fundId]), /Deactivate project funds/)
  report('database guards reject missing/wrong-book client-fund lines on both sides, dimension removal and fund deletion')

  const migrationOpening = await postOpeningBalance({ ...opening, reference: 'PROTECTED-MIGRATION' }, client)
  await reject(() => client.query(`UPDATE accounting_journal_entries SET entry_kind = 'standard' WHERE id = $1`,
    [migrationOpening.journalEntryId]), /kind is immutable/)
  await reject(() => client.query(`INSERT INTO accounting_transactions (book_id, direction, transaction_date, amount,
    category_account_id, to_cash_account_id) VALUES ($1, 'money_in', current_date, 10, $2, $3)`,
  [fx.bookId, fx.equityId, fx.cashId]), /forbidden in operating/)
  await reject(() => client.query(`INSERT INTO accounting_transactions (book_id, direction, transaction_date, amount,
    project_id, category_account_id, to_cash_account_id, journal_entry_id)
    VALUES ($1, 'money_in', current_date, 10, $2, $3, $4, $5)`,
  [fx.bookId, fx.projectId, fx.heldId, fx.cashId, migrationOpening.journalEntryId]), /cannot link to opening/)
  report('database guards reject operating EQ-OPENING lines/transactions, disguised opening links and journal-kind changes')

  // Actual loopback HTTP requests through production route registration, parser and posting service.
  // Auth is a synthetic admin fixture here; the separate structural suite verifies production auth gating.
  const originalQuery = pool.query
  const originalConnect = pool.connect
  const routeClient = {
    query: (sql: string, params?: unknown[]) => {
      const command = sql.trim().toUpperCase()
      if (command === 'BEGIN') return client.query('SAVEPOINT http_posting')
      if (command === 'COMMIT') return client.query('RELEASE SAVEPOINT http_posting')
      if (command === 'ROLLBACK') return client.query('ROLLBACK TO SAVEPOINT http_posting')
      return client.query(sql, params)
    },
    release: () => undefined,
  }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { id: fx.userId, email: 'smoke-test@nextudio.local', role: 'admin', employeeId: null, employeeName: null }
    next()
  })
  registerAccountingTransactionRoutes(app)
  registerAccountingOpeningBalanceRoutes(app)
  registerAccountingJournalRoutes(app)
  const server = createServer(app)
  try {
    pool.query = ((sql: string, params?: unknown[]) => routeClient.query(sql, params)) as typeof pool.query
    pool.connect = (async () => routeClient) as unknown as typeof pool.connect
    await new Promise<void>((resolve, rejectListen) => {
      server.once('error', rejectListen)
      server.listen(0, '127.0.0.1', resolve)
    })
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const request = async (url: string, body: object, status: number) => {
      const response = await fetch(`${origin}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) })
      const data = await response.json() as { id: string; error?: string; entry_kind?: string }
      assert.strictEqual(response.status, status, JSON.stringify(data))
      return data
    }
    const before = (await client.query('SELECT count(*) AS n FROM accounting_journal_entries')).rows[0].n
    const eqAttempts = [
      { ...receipt, category_account_id: fx.equityId },
      { ...disbursement, category_account_id: fx.equityId, classification_account_id: null },
      { ...bill, category_account_id: fx.equityId },
      { ...bill, contra_account_id: fx.equityId },
      { ...receipt, category_account_id: fx.equityId, to_cash_account_id: fx.fundId },
      { ...disbursement, category_account_id: fx.equityId, from_cash_account_id: fx.fundId },
      { ...receipt, direction: 'transfer', from_cash_account_id: fx.fundId, category_account_id: fx.equityId },
      { ...receipt, direction: 'transfer', from_cash_account_id: fx.fundId, category_account_id: null, contra_account_id: fx.equityId },
      { ...disbursement, classification_account_id: fx.equityId },
    ]
    for (const body of eqAttempts) {
      await request('/api/accounting/transactions', { ...body, entry_kind: 'opening_balance' }, 400)
    }
    report('9 direct HTTP EQ-OPENING attempts fail across money in/out, bills, funding, disbursement, transfer and classification')
    for (const body of [receipt, disbursement, bill]) {
      for (const projectId of [null, otherProject]) {
        await request('/api/accounting/transactions', { ...body, project_id: projectId }, 400)
      }
    }
    await request('/api/accounting/opening-balances', { ...opening, project_id: null }, 400)
    await request('/api/accounting/opening-balances', { ...opening, project_id: otherProject }, 400)
    assert.strictEqual((await client.query('SELECT count(*) AS n FROM accounting_journal_entries')).rows[0].n, before)
    report('HTTP client-fund postings/openings reject absent or other-book projects and failed requests leave no journals')
    const posted = await request('/api/accounting/opening-balances', { ...opening, reference: 'PROTECTED-HTTP-OPENING' }, 201)
    assert.strictEqual(posted.entry_kind, 'opening_balance')
    await assertProjectOnLine(posted.id)
    const equityLines = (await client.query('SELECT credit, debit FROM accounting_journal_lines WHERE journal_entry_id = $1 AND account_id = $2',
      [posted.id, fx.equityId])).rows
    assert.strictEqual(Number(equityLines[0].debit), 100)
    const reversed = await request(`/api/accounting/journal-entries/${posted.id}/reverse`, { reason: 'HTTP reversal test' }, 201)
    await assertProjectOnLine(reversed.id)
    assert.strictEqual(reversed.entry_kind, 'opening_balance')
    report('dedicated opening HTTP endpoint succeeds with EQ-OPENING and its reversal preserves client project and opening kind')
  } finally {
    pool.query = originalQuery
    pool.connect = originalConnect
    server.closeAllConnections()
    if (server.listening) await new Promise<void>((resolve, rejectClose) => server.close((error) => error ? rejectClose(error) : resolve()))
  }
}
