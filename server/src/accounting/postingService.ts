import type { PoolClient } from 'pg'
import { pool } from '../db'
import { HttpError, isIsoDate, roundMoney, withTransaction } from '../http'
import { writeAuditLog } from './auditLog'
import { TRANSACTION_DIRECTIONS } from './types'
import type { PostTransactionInput, TransactionDirection } from './types'

// The only place accounting_journal_lines is ever written. A "simple transaction" (money out, money in,
// or a transfer) always becomes exactly one balanced journal entry of two lines - which account is debited
// and which is credited is derived purely from `direction`, so nobody outside this file ever picks
// debit/credit by hand. Every exported function accepts an optional PoolClient: called with none, it opens
// its own transaction (via withTransaction) and commits; called with one (from the smoke test), it never
// commits on its own, which is what makes rollback-only testing against the production database safe.

type DbClient = Pick<PoolClient, 'query'>

function optionalId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (!/^\d+$/.test(String(value))) throw new HttpError(400, 'Invalid id')
  return String(value)
}

function requiredId(value: unknown, label: string): string {
  if (value === undefined || value === null || value === '' || !/^\d+$/.test(String(value))) {
    throw new HttpError(400, `${label} is required`)
  }
  return String(value)
}

// Validates and normalizes the plain-language form the Add Transaction page submits (Paid To, Paid From,
// Purpose, ...) into the shape the posting service needs. Does not touch the database.
export function parsePostTransactionInput(body: Record<string, unknown>, userId: string): PostTransactionInput {
  const book_id = requiredId(body.book_id, 'Book')
  const direction = body.direction
  if (typeof direction !== 'string' || !(TRANSACTION_DIRECTIONS as readonly string[]).includes(direction)) {
    throw new HttpError(400, 'Direction must be one of: ' + TRANSACTION_DIRECTIONS.join(', '))
  }
  if (direction === 'non_cash') {
    throw new HttpError(400, 'Manual (non-cash) journal entries are not supported by Add Transaction in this phase')
  }

  const transaction_date = body.transaction_date
  if (!isIsoDate(transaction_date)) throw new HttpError(400, 'Date is required')

  const amount = body.amount
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Amount must be greater than 0')
  }

  const currency_code = typeof body.currency_code === 'string' && body.currency_code.trim() ? body.currency_code.trim().toUpperCase() : 'USD'
  if (!/^[A-Z]{3}$/.test(currency_code)) throw new HttpError(400, 'Currency must be a 3-letter code such as USD')

  const exchange_rate = body.exchange_rate === undefined || body.exchange_rate === null || body.exchange_rate === '' ? null : Number(body.exchange_rate)
  if (exchange_rate !== null && (!Number.isFinite(exchange_rate) || exchange_rate <= 0)) {
    throw new HttpError(400, 'Exchange rate must be greater than 0')
  }

  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  const reference = typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim() : null
  const project_id = optionalId(body.project_id)
  const counterparty_id = optionalId(body.counterparty_id)
  const category_account_id = optionalId(body.category_account_id)
  const from_cash_account_id = optionalId(body.from_cash_account_id)
  const to_cash_account_id = optionalId(body.to_cash_account_id)

  if (direction === 'money_out') {
    if (!from_cash_account_id) throw new HttpError(400, 'Choose the account this was paid from')
    if (!category_account_id) throw new HttpError(400, 'Choose a purpose / expense category')
    if (to_cash_account_id) throw new HttpError(400, 'A payment does not have a destination cash account')
  } else if (direction === 'money_in') {
    if (!to_cash_account_id) throw new HttpError(400, 'Choose the account this was received into')
    if (!category_account_id) throw new HttpError(400, 'Choose what this money is for')
    if (from_cash_account_id) throw new HttpError(400, 'Money received does not have a source cash account')
  } else if (direction === 'transfer') {
    if (!from_cash_account_id) throw new HttpError(400, 'Choose the account to transfer from')
    if (!to_cash_account_id) throw new HttpError(400, 'Choose the account to transfer to')
    if (from_cash_account_id === to_cash_account_id) throw new HttpError(400, 'The transfer accounts must be different')
    if (category_account_id) throw new HttpError(400, 'A transfer does not use a category')
  }

  return {
    book_id,
    direction: direction as TransactionDirection,
    transaction_date,
    amount: roundMoney(amount),
    currency_code,
    exchange_rate,
    description,
    reference,
    project_id,
    counterparty_id,
    category_account_id,
    from_cash_account_id,
    to_cash_account_id,
    created_by_user_id: userId,
  }
}

async function lookupBook(db: DbClient, bookId: string) {
  const result = await db.query('SELECT id, code, is_active FROM accounting_books WHERE id = $1', [bookId])
  if (result.rows.length === 0) throw new HttpError(400, 'Book does not exist')
  if (!result.rows[0].is_active) throw new HttpError(400, 'This book is not active')
  return result.rows[0] as { id: string; code: string; is_active: boolean }
}

async function lookupCashAccount(db: DbClient, bookId: string, id: string, label: string) {
  const result = await db.query(
    'SELECT id, ledger_account_id, name, is_active FROM accounting_cash_accounts WHERE id = $1 AND book_id = $2',
    [id, bookId]
  )
  if (result.rows.length === 0) throw new HttpError(400, `${label} account does not exist in this book`)
  if (!result.rows[0].is_active) throw new HttpError(400, `${label} account is not active`)
  return result.rows[0] as { id: string; ledger_account_id: string; name: string; is_active: boolean }
}

async function lookupCategoryAccount(db: DbClient, bookId: string, id: string) {
  const result = await db.query('SELECT id, name, type, is_active FROM accounting_accounts WHERE id = $1 AND book_id = $2', [id, bookId])
  if (result.rows.length === 0) throw new HttpError(400, 'Category account does not exist in this book')
  if (!result.rows[0].is_active) throw new HttpError(400, 'Category account is not active')
  return result.rows[0] as { id: string; name: string; type: string; is_active: boolean }
}

async function assertCounterparty(db: DbClient, bookId: string, id: string | null) {
  if (!id) return
  const result = await db.query('SELECT 1 FROM accounting_counterparties WHERE id = $1 AND book_id = $2', [id, bookId])
  if (result.rows.length === 0) throw new HttpError(400, 'Payee does not exist in this book')
}

async function assertProject(db: DbClient, id: string | null) {
  if (!id) return
  const result = await db.query('SELECT 1 FROM projects WHERE id = $1', [id])
  if (result.rows.length === 0) throw new HttpError(400, 'Project does not exist')
}

type JournalLineInsert = {
  account_id: string
  debit: number
  credit: number
  project_id: string | null
  counterparty_id: string | null
  cash_account_id: string | null
  memo: string | null
}

// The whole "simple posting model": which account is debited and which is credited, purely from direction.
// money_out: Dr expense/cost account, Cr the cash account paid from.
// money_in:  Dr the cash account received into, Cr income/liability account (never assumed to be revenue).
// transfer:  Dr destination cash, Cr source cash - never touches a category account, so it can never look
// like income or expense on any report built from category-account lines.
async function computeLines(db: DbClient, input: PostTransactionInput): Promise<JournalLineInsert[]> {
  if (input.direction === 'money_out') {
    const category = await lookupCategoryAccount(db, input.book_id, input.category_account_id!)
    const cash = await lookupCashAccount(db, input.book_id, input.from_cash_account_id!, 'Paid from')
    return [
      { account_id: category.id, debit: input.amount, credit: 0, project_id: input.project_id, counterparty_id: input.counterparty_id, cash_account_id: null, memo: input.description },
      { account_id: cash.ledger_account_id, debit: 0, credit: input.amount, project_id: null, counterparty_id: null, cash_account_id: cash.id, memo: input.description },
    ]
  }
  if (input.direction === 'money_in') {
    const category = await lookupCategoryAccount(db, input.book_id, input.category_account_id!)
    const cash = await lookupCashAccount(db, input.book_id, input.to_cash_account_id!, 'Received into')
    return [
      { account_id: cash.ledger_account_id, debit: input.amount, credit: 0, project_id: null, counterparty_id: null, cash_account_id: cash.id, memo: input.description },
      { account_id: category.id, debit: 0, credit: input.amount, project_id: input.project_id, counterparty_id: input.counterparty_id, cash_account_id: null, memo: input.description },
    ]
  }
  // transfer
  const toCash = await lookupCashAccount(db, input.book_id, input.to_cash_account_id!, 'Transfer to')
  const fromCash = await lookupCashAccount(db, input.book_id, input.from_cash_account_id!, 'Transfer from')
  return [
    { account_id: toCash.ledger_account_id, debit: input.amount, credit: 0, project_id: null, counterparty_id: null, cash_account_id: toCash.id, memo: input.description },
    { account_id: fromCash.ledger_account_id, debit: 0, credit: input.amount, project_id: null, counterparty_id: null, cash_account_id: fromCash.id, memo: input.description },
  ]
}

async function nextJournalReference(db: DbClient, bookCode: string): Promise<string> {
  const seq = (await db.query("SELECT nextval('accounting_journal_reference_seq') AS n")).rows[0].n
  return `${bookCode}-JE-${seq}`
}

export type PostedTransaction = { transactionId: string; journalEntryId: string; reference: string }

async function doPost(client: PoolClient, input: PostTransactionInput): Promise<PostedTransaction> {
  const book = await lookupBook(client, input.book_id)
  await assertProject(client, input.project_id)
  await assertCounterparty(client, input.book_id, input.counterparty_id)
  const lines = await computeLines(client, input)

  // Defensive: computeLines always builds an exactly-balanced pair, so this can only ever fire if a future
  // change breaks that invariant - insurance, not the primary guarantee.
  const totalDebit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0))
  const totalCredit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0))
  if (totalDebit !== totalCredit) {
    throw new HttpError(500, 'Unbalanced journal entry - this is a bug, nothing was posted')
  }

  const reference = await nextJournalReference(client, book.code)
  const entry = await client.query(
    `INSERT INTO accounting_journal_entries (book_id, entry_date, reference, description, status, posted_at, posted_by_user_id)
     VALUES ($1, $2, $3, $4, 'posted', now(), $5) RETURNING id`,
    [input.book_id, input.transaction_date, reference, input.description, input.created_by_user_id]
  )
  const journalEntryId = entry.rows[0].id

  for (const line of lines) {
    await client.query(
      `INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit, project_id, counterparty_id, cash_account_id, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [journalEntryId, input.book_id, line.account_id, line.debit, line.credit, line.project_id, line.counterparty_id, line.cash_account_id, line.memo]
    )
  }

  const transaction = await client.query(
    `INSERT INTO accounting_transactions (book_id, direction, status, transaction_date, description, amount, currency_code, exchange_rate,
                                          project_id, counterparty_id, category_account_id, from_cash_account_id, to_cash_account_id,
                                          reference, journal_entry_id, created_by_user_id)
     VALUES ($1, $2, 'posted', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      input.book_id, input.direction, input.transaction_date, input.description, input.amount, input.currency_code, input.exchange_rate,
      input.project_id, input.counterparty_id, input.category_account_id, input.from_cash_account_id, input.to_cash_account_id,
      input.reference, journalEntryId, input.created_by_user_id,
    ]
  )
  const transactionId = transaction.rows[0].id

  await writeAuditLog(client, {
    book_id: input.book_id,
    entity_type: 'transaction',
    entity_id: transactionId,
    action: 'post',
    performed_by_user_id: input.created_by_user_id,
    after: { ...input, journal_entry_id: journalEntryId, reference },
  })

  return { transactionId, journalEntryId, reference }
}

export async function postTransaction(input: PostTransactionInput, injectedClient?: PoolClient): Promise<PostedTransaction> {
  if (injectedClient) return doPost(injectedClient, input)
  return withTransaction((client) => doPost(client, input))
}

// A reversal of money_out becomes a money_in of the same amount back into the same cash account (and vice
// versa); a reversal of a transfer is the same transfer with source/destination swapped. This isn't an
// arbitrary choice: it is exactly what swapping every line's debit and credit already produces, so the
// reversal's header (direction, cash account roles) and its journal lines stay consistent with each other
// and with the accounting_transactions check constraint.
function reversalHeader(t: {
  direction: string
  from_cash_account_id: string | null
  to_cash_account_id: string | null
  category_account_id: string | null
}) {
  if (t.direction === 'money_out') {
    return { direction: 'money_in', from_cash_account_id: null, to_cash_account_id: t.from_cash_account_id, category_account_id: t.category_account_id }
  }
  if (t.direction === 'money_in') {
    return { direction: 'money_out', from_cash_account_id: t.to_cash_account_id, to_cash_account_id: null, category_account_id: t.category_account_id }
  }
  // transfer: swap source and destination
  return { direction: 'transfer', from_cash_account_id: t.to_cash_account_id, to_cash_account_id: t.from_cash_account_id, category_account_id: null }
}

export type ReversalResult = { reversalEntryId: string; reversalTransactionId: string | null }

async function doReverse(client: PoolClient, journalEntryId: string, userId: string, reason: string | null): Promise<ReversalResult> {
  // Locked so two simultaneous reversal requests for the same entry can't both succeed: both contend for this
  // same row, so the second one only proceeds after the first has committed its reversal row, at which point
  // the "already reversed" check below sees it and rejects.
  const locked = await client.query(
    `SELECT id, book_id, status, reference, reversal_of_entry_id FROM accounting_journal_entries WHERE id = $1 FOR UPDATE`,
    [journalEntryId]
  )
  if (locked.rows.length === 0) throw new HttpError(404, 'Journal entry not found')
  const original = locked.rows[0]
  if (original.status !== 'posted') throw new HttpError(400, 'Only a posted entry can be reversed')

  // A reversal cannot itself be reversed. This isn't just a UI restriction - it keeps every reversal
  // relationship exactly one level deep (an entry is either an untouched original, or a reversal of one),
  // which is what lets management totals (Dashboard, Project/Payee totals) safely exclude "this transaction
  // is part of a corrected pair" with a simple, always-correct rule instead of having to walk a chain. To redo
  // an original after reversing it by mistake, enter it again as a new transaction.
  if (original.reversal_of_entry_id) {
    throw new HttpError(400, 'This entry is itself a reversal and cannot be reversed again. To redo the original, enter it as a new transaction.')
  }

  // "Already reversed" is answered by existence of another entry pointing back at this one - not by status,
  // since a reversed entry's own status never changes (see the comment on accounting_journal_entries in the
  // schema migration for why: every report that filters status = 'posted' needs to keep seeing the original).
  const existingReversal = await client.query('SELECT id FROM accounting_journal_entries WHERE reversal_of_entry_id = $1', [journalEntryId])
  if (existingReversal.rows.length > 0) throw new HttpError(400, 'This entry has already been reversed')

  const lines = await client.query(
    `SELECT account_id, debit, credit, project_id, counterparty_id, cash_account_id, memo
     FROM accounting_journal_lines WHERE journal_entry_id = $1`,
    [journalEntryId]
  )

  const book = await client.query('SELECT code FROM accounting_books WHERE id = $1', [original.book_id])
  const reference = await nextJournalReference(client, book.rows[0].code)
  const note = `Reversal of ${original.reference ?? 'entry #' + original.id}${reason ? ': ' + reason : ''}`

  const reversalEntry = await client.query(
    `INSERT INTO accounting_journal_entries (book_id, entry_date, reference, description, status, reversal_of_entry_id, posted_at, posted_by_user_id)
     VALUES ($1, current_date, $2, $3, 'posted', $4, now(), $5) RETURNING id`,
    [original.book_id, reference, note, journalEntryId, userId]
  )
  const reversalEntryId = reversalEntry.rows[0].id

  // Every original line, debit and credit swapped - the exact opposite of what was posted, nothing else changed
  for (const line of lines.rows) {
    await client.query(
      `INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit, project_id, counterparty_id, cash_account_id, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [reversalEntryId, original.book_id, line.account_id, line.credit, line.debit, line.project_id, line.counterparty_id, line.cash_account_id, line.memo]
    )
  }

  // The transaction that produced the original entry, if any (manual/imported entries may have none) - found
  // by the one authoritative link (accounting_transactions.journal_entry_id), not a back-pointer on the entry.
  let reversalTransactionId: string | null = null
  const originalTransaction = await client.query('SELECT * FROM accounting_transactions WHERE journal_entry_id = $1', [journalEntryId])
  if (originalTransaction.rows.length > 0) {
    const t = originalTransaction.rows[0]
    const header = reversalHeader(t)
    const reversalTransaction = await client.query(
      `INSERT INTO accounting_transactions (book_id, direction, status, transaction_date, description, amount, currency_code, exchange_rate,
                                            project_id, counterparty_id, category_account_id, from_cash_account_id, to_cash_account_id,
                                            reference, reversal_of_transaction_id, journal_entry_id, created_by_user_id)
       VALUES ($1, $2, 'posted', current_date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        t.book_id, header.direction, note, t.amount, t.currency_code, t.exchange_rate,
        t.project_id, t.counterparty_id, header.category_account_id, header.from_cash_account_id, header.to_cash_account_id,
        reference, t.id, reversalEntryId, userId,
      ]
    )
    reversalTransactionId = reversalTransaction.rows[0].id
    // The original transaction's own fields, including status, are never touched - it stays a truthful,
    // permanent record of what was originally entered and posted. "Reversed" is answered the same way as for
    // the entry above: by checking whether another transaction exists with reversal_of_transaction_id = t.id.
  }

  await writeAuditLog(client, {
    book_id: original.book_id,
    entity_type: 'journal_entry',
    entity_id: journalEntryId,
    action: 'reverse',
    performed_by_user_id: userId,
    before: { status: 'posted' },
    after: { reversal_entry_id: reversalEntryId },
    notes: reason,
  })

  return { reversalEntryId, reversalTransactionId }
}

export async function reverseJournalEntry(
  journalEntryId: string,
  userId: string,
  reason: string | null,
  injectedClient?: PoolClient
): Promise<ReversalResult> {
  if (injectedClient) return doReverse(injectedClient, journalEntryId, userId, reason)
  return withTransaction((client) => doReverse(client, journalEntryId, userId, reason))
}

// Convenience for routes that only have a transaction id (e.g. reversing from the Transactions list):
// looks up the journal entry that transaction posted, then reverses it the normal way. The "already posted /
// already reversed" checks all live in doReverse (entry-level, the single source of truth) - this only needs
// to find the entry to reverse.
export async function reverseTransaction(transactionId: string, userId: string, reason: string | null): Promise<ReversalResult> {
  const result = await pool.query('SELECT journal_entry_id FROM accounting_transactions WHERE id = $1', [transactionId])
  if (result.rows.length === 0) throw new HttpError(404, 'Transaction not found')
  if (!result.rows[0].journal_entry_id) throw new HttpError(400, 'This transaction has no journal entry to reverse')
  return reverseJournalEntry(result.rows[0].journal_entry_id, userId, reason)
}
