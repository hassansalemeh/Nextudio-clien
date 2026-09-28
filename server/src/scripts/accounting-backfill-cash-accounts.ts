// Creates the missing accounting_cash_accounts wrapper row for each of the historical import's consolidated
// cash/bank/petty-cash ledger accounts (AST-CASH/AST-BANK/AST-PETTY), and backfills cash_account_id on the
// existing journal lines that post to them. This touches ONLY the nullable cash_account_id dimension column -
// no debit, credit, account_id, date or any other financial value is read or written. Idempotent: an account
// whose cash_account_id is already set is left alone, and re-running finds nothing left to do.
//
//   npm run accounting:backfill-cash -- --book=NEXTUDIO             dry run: reports what WOULD change, writes nothing
//   npm run accounting:backfill-cash -- --book=NEXTUDIO --apply     actually creates the account(s) and backfills
//   npm run accounting:backfill-cash -- --book=NEXTUDIO_SARL [--apply]
import { pool } from '../db'
import { withTransaction } from '../http'
import { writeAuditLog } from '../accounting/auditLog'

type Def = { code: string; name: string; kind: 'cash' | 'bank' | 'petty_cash' }

const CHART: Record<'NEXTUDIO' | 'NEXTUDIO_SARL', Def[]> = {
  NEXTUDIO: [
    { code: 'AST-CASH', name: 'Nextudio Cash', kind: 'cash' },
    { code: 'AST-BANK', name: 'Nextudio Bank', kind: 'bank' },
    { code: 'AST-PETTY', name: 'Nextudio Petty Cash', kind: 'petty_cash' },
  ],
  NEXTUDIO_SARL: [
    { code: 'AST-CASH', name: 'Nextudio SARL Cash', kind: 'cash' },
    { code: 'AST-BANK', name: 'Nextudio SARL Bank', kind: 'bank' },
  ],
}

async function main() {
  const args = process.argv.slice(2)
  const bookArg = args.find((a) => a.startsWith('--book='))?.split('=')[1]
  const apply = args.includes('--apply')
  if (!bookArg || (bookArg !== 'NEXTUDIO' && bookArg !== 'NEXTUDIO_SARL')) {
    console.error('Usage: tsx accounting-backfill-cash-accounts.ts --book=NEXTUDIO|NEXTUDIO_SARL [--apply]')
    process.exitCode = 1
    return
  }
  const chart = CHART[bookArg]

  const book = (await pool.query('SELECT id, code, name FROM accounting_books WHERE code = $1', [bookArg])).rows[0]
  if (!book) throw new Error(`Book ${bookArg} does not exist`)

  console.log(`${apply ? 'APPLYING' : 'DRY RUN (nothing will be written)'} - book ${book.code} (${book.name})`)

  for (const def of chart) {
    const ledger = (await pool.query('SELECT id FROM accounting_accounts WHERE book_id = $1 AND code = $2', [book.id, def.code])).rows[0]
    if (!ledger) {
      console.log(`  skip ${def.code}: no such account in this book`)
      continue
    }
    const existing = (await pool.query('SELECT id FROM accounting_cash_accounts WHERE book_id = $1 AND ledger_account_id = $2', [book.id, ledger.id])).rows[0]
    const linesNeedingBackfill = (
      await pool.query('SELECT count(*)::int AS n FROM accounting_journal_lines WHERE account_id = $1 AND cash_account_id IS NULL', [ledger.id])
    ).rows[0].n

    if (existing) {
      console.log(`  ${def.code}: cash account already exists (id ${existing.id}); ${linesNeedingBackfill} lines still need cash_account_id backfilled`)
    } else {
      console.log(`  ${apply ? 'creating' : 'would create'} cash account "${def.name}" (${def.kind}) -> ledger ${def.code}; ${linesNeedingBackfill} lines to backfill`)
    }

    if (!apply) continue

    const userId = (await pool.query(`SELECT id FROM app_users WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0]?.id
    await withTransaction(async (client) => {
      let cashAccountId = existing?.id
      if (!cashAccountId) {
        const inserted = await client.query(
          `INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, currency_code) VALUES ($1,$2,$3,$4,'USD') RETURNING id`,
          [book.id, def.name, def.kind, ledger.id]
        )
        cashAccountId = inserted.rows[0].id
        await writeAuditLog(client, {
          book_id: book.id, entity_type: 'cash_account', entity_id: cashAccountId, action: 'create',
          performed_by_user_id: userId, after: { name: def.name, kind: def.kind, ledger_account_id: ledger.id },
          notes: 'accounting-backfill-cash-accounts.ts - historical import cash-account exposure',
        })
      }
      const updated = await client.query(
        'UPDATE accounting_journal_lines SET cash_account_id = $1 WHERE account_id = $2 AND cash_account_id IS NULL',
        [cashAccountId, ledger.id]
      )
      console.log(`    backfilled cash_account_id on ${updated.rowCount} lines`)
    })
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Backfill failed:', err)
      process.exitCode = 1
    })
    .finally(() => pool.end())
}
