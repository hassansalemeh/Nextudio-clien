// The REAL historical importer - writes to whatever DATABASE_URL points at (production, per this repo's
// setup). Dry-run by default, exactly like accounting-seed-chart.ts:
//
//   npx tsx tools/one-off/legacy-import/apply-import.ts --book=NEXTUDIO             dry run, writes nothing
//   npx tsx tools/one-off/legacy-import/apply-import.ts --book=NEXTUDIO --apply     writes for real
//   npx tsx tools/one-off/legacy-import/apply-import.ts --book=NEXTUDIO_SARL [--apply]
//
// One book per run, one database transaction per run: legacy jobs, then counterparties, then every
// journal entry/line/legacy-ref row, or nothing at all if anything fails. Never sets mapped_project_id or
// project_id anywhere in this round - every legacy job stays historical-only (accounting_legacy_jobs,
// status='unmapped'), per the approved conservative decision. Never touches `projects`, `clients` or
// `employees` except to READ existing employee/client ids for the handful of already-confirmed links.
import { loadTables } from './parse'
import { loadAccounts, loadVouchers, loadLines, buildPairGroups, classifyAccounts, findOpeningCandidates, classifyGroups, assembleJournalEntries, entryBalance, round2 } from './pipeline'
import { LIVE_ACCOUNTS, JOB_MAP, LegacyBookCode } from './reference'
import { pool } from '../../../src/db'

const IMPORT_BATCH_ID = 20260928 // this task's single production historical-import run

function arg(name: string, def: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : def
}

async function main() {
  const bookArg = process.argv.find((a) => a.startsWith('--book='))?.split('=')[1] as 'NEXTUDIO' | 'NEXTUDIO_SARL' | undefined
  const apply = process.argv.includes('--apply')
  if (!bookArg || (bookArg !== 'NEXTUDIO' && bookArg !== 'NEXTUDIO_SARL')) {
    console.error('Usage: apply-import.ts --book=NEXTUDIO|NEXTUDIO_SARL [--apply]')
    process.exitCode = 1
    return
  }
  const legacyBook: LegacyBookCode = bookArg === 'NEXTUDIO' ? 'NEXTUDIO' : 'NEXTUDIOSARL'
  const defaultPath = legacyBook === 'NEXTUDIO' ? 'C:\\Users\\Hassan\\Downloads\\NEXTUDIO_20260928.sql' : 'C:\\Users\\Hassan\\Downloads\\NEXTUDIOsarl_20260928.sql'
  const filePath = arg(legacyBook === 'NEXTUDIO' ? 'nextudio' : 'sarl', defaultPath)

  console.log(`${apply ? 'APPLYING' : 'DRY RUN (nothing will be written)'} - legacy book ${legacyBook} -> Control book ${bookArg}`)

  const tables = loadTables(filePath, ['accounts', 'journalvouchers', 'vouchersentries', 'jobs'])
  const accounts = loadAccounts(tables.accounts)
  const vouchers = loadVouchers(tables.journalvouchers)
  const lines = loadLines(tables.vouchersentries)
  const groups = buildPairGroups(legacyBook, vouchers, lines)
  const profiles = classifyAccounts(legacyBook, accounts, lines)
  const openingCandidates = findOpeningCandidates(groups)
  const classified = classifyGroups(legacyBook, groups, profiles, openingCandidates)
  const entries = assembleJournalEntries(legacyBook, vouchers, classified)

  // Final in-memory safety check before touching the database, mirroring the dry-run report's own gates.
  const proposedLines = entries.flatMap((e) => e.lines)
  const sourceDebit = round2(lines.reduce((s, l) => s + (l.base1Debit ?? 0), 0))
  const proposedDebit = round2(proposedLines.reduce((s, l) => s + (l.debit ?? 0), 0))
  if (proposedLines.length !== lines.length) throw new Error(`Coverage check failed: ${proposedLines.length} proposed lines vs ${lines.length} source lines`)
  if (sourceDebit !== proposedDebit) throw new Error(`Debit total check failed: source ${sourceDebit} vs proposed ${proposedDebit}`)
  for (const e of entries) {
    const b = entryBalance(e)
    if (b.diff !== 0) throw new Error(`Entry for JV${e.legacyJvId} does not balance: diff ${b.diff}`)
  }
  console.log(`Pre-flight: ${lines.length} source lines, ${entries.length} entries / ${proposedLines.length} lines to write, all balanced, coverage exact.`)

  const jobsForBook = JOB_MAP.filter((j) => j.book === legacyBook)
  const counterpartyDefs = [...profiles.values()].filter((p) => p.counterpartyKind !== null)

  console.log(`Would create: ${jobsForBook.length} accounting_legacy_jobs rows (all status='unmapped', mapped_project_id=NULL), ${counterpartyDefs.length} accounting_counterparties rows, ${entries.length} journal entries, ${proposedLines.length} journal lines + legacy-ref rows.`)

  if (!apply) {
    console.log('\nDry run only - nothing was written. Re-run with --apply to write for real.')
    await pool.end()
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const bookRow = (await client.query(`SELECT id FROM accounting_books WHERE code = $1`, [bookArg])).rows[0]
    if (!bookRow) throw new Error(`Book ${bookArg} not found`)
    const bookId: number = bookRow.id

    const admin = (await client.query(`SELECT id FROM app_users WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0]
    if (!admin) throw new Error('No admin app_users row found')

    // 1. Legacy jobs - historical-only, every one of them (no exceptions this round).
    const jobIdMap = new Map<number, number>() // legacyJobId -> accounting_legacy_jobs.id
    for (const j of jobsForBook) {
      const existing = await client.query(`SELECT id FROM accounting_legacy_jobs WHERE book_id = $1 AND legacy_job_id = $2`, [bookId, j.legacyJobId])
      if (existing.rows[0]) {
        jobIdMap.set(j.legacyJobId, existing.rows[0].id)
        continue
      }
      const r = await client.query(
        `INSERT INTO accounting_legacy_jobs (book_id, legacy_job_id, legacy_job_code, legacy_job_name, mapped_project_id, status)
         VALUES ($1,$2,$3,$4,NULL,'unmapped') RETURNING id`,
        [bookId, j.legacyJobId, j.legacyJobCode, j.legacyJobName]
      )
      jobIdMap.set(j.legacyJobId, r.rows[0].id)
    }
    console.log(`  legacy jobs: ${jobIdMap.size} (all historical-only)`)

    // 2. Counterparties - preserve every one individually; only the 4 already-confirmed Control links are set.
    const counterpartyIdMap = new Map<number, number>() // legacyAccountId -> accounting_counterparties.id
    for (const p of counterpartyDefs) {
      const existing = await client.query(`SELECT id FROM accounting_counterparties WHERE book_id = $1 AND lower(name) = lower($2)`, [bookId, p.account.mainName])
      if (existing.rows[0]) {
        counterpartyIdMap.set(p.account.accountId, existing.rows[0].id)
        continue
      }
      const r = await client.query(
        `INSERT INTO accounting_counterparties (book_id, name, kind, client_id, employee_id, contact_info)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [bookId, p.account.mainName, p.counterpartyKind, p.linkedClientId, p.linkedEmployeeId, `Legacy Polypus account ${p.account.accountNumber}`]
      )
      counterpartyIdMap.set(p.account.accountId, r.rows[0].id)
    }
    console.log(`  counterparties: ${counterpartyIdMap.size}`)

    // 3. Journal entries + lines + legacy refs.
    let entryCount = 0
    let lineCount = 0
    for (const entry of entries) {
      const je = await client.query(
        `INSERT INTO accounting_journal_entries (book_id, entry_date, reference, description, status, entry_kind, currency_code, posted_at, posted_by_user_id)
         VALUES ($1,$2,$3,$4,'posted',$5,'USD',now(),$6) RETURNING id`,
        [bookId, entry.date, entry.reference, `Legacy Polypus import - JV${entry.legacyJvId}${entry.splitFromLegacyVoucher ? ' (split)' : ''}`, entry.entryKind, admin.id]
      )
      const journalEntryId = je.rows[0].id
      entryCount++
      for (const l of entry.lines) {
        const target = LIVE_ACCOUNTS[`${bookArg}:${l.targetCode}`]
        if (!target) throw new Error(`No live account for ${bookArg}:${l.targetCode} (legacy voucher entry ${l.voucherEntryId})`)
        const counterpartyId = counterpartyIdMap.get(l.accountId) ?? null
        const legacyJobRowId = l.jobId !== null ? jobIdMap.get(l.jobId) ?? null : null
        const jl = await client.query(
          `INSERT INTO accounting_journal_lines (journal_entry_id, book_id, account_id, debit, credit, counterparty_id, legacy_job_id, memo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [journalEntryId, bookId, target.id, l.debit ?? 0, l.credit ?? 0, counterpartyId, legacyJobRowId, l.narration || null]
        )
        const legacyAccount = accounts.get(l.accountId)
        const fxRate = l.debit && l.base2Debit ? round2(l.base2Debit / l.debit) : l.credit && l.base2Credit ? round2(l.base2Credit / l.credit) : null
        await client.query(
          `INSERT INTO accounting_legacy_journal_line_ref
             (journal_line_id, legacy_source, legacy_book_code, legacy_jv_id, legacy_voucher_entry_id, legacy_account_id, legacy_account_number,
              legacy_job_id_raw, legacy_jv_type_code, legacy_narration, legacy_reference, legacy_base1_amount, legacy_base2_amount, legacy_base2_currency,
              legacy_fx_rate, legacy_native_currency_id, legacy_native_amount, split_from_legacy_voucher, import_batch_id)
           VALUES ($1,'polypus',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'LBP',$13,$14,$15,$16,$17)`,
          [
            jl.rows[0].id, legacyBook, entry.legacyJvId, l.voucherEntryId, l.accountId, legacyAccount?.accountNumber ?? null,
            l.jobId, l.jvTypeId !== null ? String(l.jvTypeId) : null, l.narration || null, l.reference || null,
            l.debit ?? l.credit ?? 0, l.base2Debit ?? l.base2Credit ?? null, fxRate, l.nativeCurrencyId, l.foreignCurrency,
            entry.splitFromLegacyVoucher, IMPORT_BATCH_ID,
          ]
        )
        lineCount++
      }
    }
    console.log(`  journal entries: ${entryCount}, journal lines: ${lineCount}`)

    await client.query(
      `INSERT INTO accounting_audit_log (book_id, entity_type, entity_id, action, performed_by_user_id, after, notes)
       VALUES ($1,'book',$1,'post',$2,$3,$4)`,
      [bookId, admin.id, JSON.stringify({ entries: entryCount, lines: lineCount, jobs: jobIdMap.size, counterparties: counterpartyIdMap.size, batch: IMPORT_BATCH_ID }), `apply-import.ts historical Polypus import, batch ${IMPORT_BATCH_ID}`]
    )

    await client.query('COMMIT')
    console.log(`\nCommitted: ${entryCount} journal entries, ${lineCount} journal lines, ${jobIdMap.size} legacy jobs, ${counterpartyIdMap.size} counterparties.`)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Import failed (rolled back if a transaction was open):', err)
  process.exitCode = 1
})
