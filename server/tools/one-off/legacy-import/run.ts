// Local, offline dry run of the Polypus -> Phase 1B historical import.
//
//   npx tsx tools/one-off/legacy-import/run.ts [--nextudio=PATH] [--sarl=PATH]
//
// Reads the two mysqldump files straight off disk (never copies them into the repo), does everything in
// memory plus a tiny on-disk idempotency ledger under server/backups/legacy-import (gitignored), and NEVER
// opens a database connection - there is no `pool` import anywhere in this tool on purpose. Run it twice in
// a row to see the idempotency proof in section 9.
//
// Requirement 1 (100% ledger preservation): the legacy JVID is the unit of import, not the pair. Every line
// referenced by vouchersentries ends up on exactly one HistoricalJournalEntry, whether or not the pipeline
// could confidently classify its business meaning - see pipeline.ts's historicalAccountFor() and
// assembleJournalEntries() for how that's guaranteed and proven below.
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { loadTables } from './parse'
import {
  loadAccounts, loadVouchers, loadLines, loadAccountsBalances, buildPairGroups, classifyAccounts,
  findOpeningCandidates, classifyGroups, assembleJournalEntries, entryBalance, resolveClientLineTargets,
  getHistoricalAccountRegistry, round2,
  LegacyAccount, LegacyLine, LegacyAccountBalance, LegacyJournalVoucher, AccountProfile, ClassifiedGroup, PairGroup, HistoricalJournalEntry,
} from './pipeline'
import { LIVE_ACCOUNTS, PROPOSED_NEW_ACCOUNTS, HISTORICAL_ACCOUNT_ROOTS, BOOK_TARGET, JOB_MAP, LegacyBookCode } from './reference'
import { applyBatch, key } from './stagingStore'

const OUT_DIR = join(__dirname, '..', '..', '..', 'backups', 'legacy-import')
const REPORTS_DIR = join(OUT_DIR, 'reports')
const LEDGER_DIR = join(OUT_DIR, 'staging')
mkdirSync(REPORTS_DIR, { recursive: true })

function arg(name: string, def: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : def
}

const FILES: { book: LegacyBookCode; path: string }[] = [
  { book: 'NEXTUDIO', path: arg('nextudio', 'C:\\Users\\Hassan\\Downloads\\NEXTUDIO_20260928.sql') },
  { book: 'NEXTUDIOSARL', path: arg('sarl', 'C:\\Users\\Hassan\\Downloads\\NEXTUDIOsarl_20260928.sql') },
]

function resolveCode(book: LegacyBookCode, code: string): { display: string; isNew: boolean; isHistorical: boolean } {
  const targetBook = BOOK_TARGET[book]
  const live = LIVE_ACCOUNTS[`${targetBook}:${code}`]
  if (live) return { display: `${targetBook}:${code} (id ${live.id})`, isNew: false, isHistorical: false }
  const proposed = PROPOSED_NEW_ACCOUNTS.find((p) => p.book === book && p.code === code)
  if (proposed) return { display: `${targetBook}:${code} [PROPOSED - not yet created]`, isNew: true, isHistorical: false }
  if (code.startsWith('HIST-')) return { display: `${targetBook}:${code} [HISTORICAL SUB-ACCOUNT - not yet created]`, isNew: true, isHistorical: true }
  return { display: `${targetBook}:${code} [NO SUCH ACCOUNT - error]`, isNew: false, isHistorical: false }
}

type BookResult = {
  book: LegacyBookCode
  accounts: Map<number, LegacyAccount>
  vouchers: Map<number, LegacyJournalVoucher>
  lines: LegacyLine[]
  balances: LegacyAccountBalance[]
  groups: PairGroup[]
  profiles: Map<number, AccountProfile>
  openingCandidates: Set<string>
  classified: ClassifiedGroup[]
  entries: HistoricalJournalEntry[]
}

function processBook(book: LegacyBookCode, path: string): BookResult {
  const tables = loadTables(path, ['accounts', 'journalvouchers', 'vouchersentries', 'jobs', 'accountsbalances'])
  const accounts = loadAccounts(tables.accounts)
  const vouchers = loadVouchers(tables.journalvouchers)
  const lines = loadLines(tables.vouchersentries)
  const balances = loadAccountsBalances(tables.accountsbalances)
  const groups = buildPairGroups(book, vouchers, lines)
  const profiles = classifyAccounts(book, accounts, lines)
  const openingCandidates = findOpeningCandidates(groups)
  const classified = classifyGroups(book, groups, profiles, openingCandidates)
  const entries = assembleJournalEntries(book, vouchers, classified)
  return { book, accounts, vouchers, lines, balances, groups, profiles, openingCandidates, classified, entries }
}

function sumBase1(lines: { base1Debit?: number | null; base1Credit?: number | null; debit?: number | null; credit?: number | null }[]): { debit: number; credit: number } {
  let debit = 0
  let credit = 0
  for (const l of lines) {
    debit += l.base1Debit ?? l.debit ?? 0
    credit += l.base1Credit ?? l.credit ?? 0
  }
  return { debit: round2(debit), credit: round2(credit) }
}

async function main() {
  const results: BookResult[] = FILES.map((f) => processBook(f.book, f.path))
  const csvRows: Record<string, string[]> = {}
  const jsonOut: Record<string, unknown> = {}

  console.log('='.repeat(100))
  console.log('POLYPUS -> PHASE 1B HISTORICAL IMPORT - LOCAL DRY RUN (no database connection used)')
  console.log('='.repeat(100))

  const overall = {
    sourceVouchers: 0, sourceLines: 0, proposedEntries: 0, proposedLines: 0,
    sourceDebit: 0, sourceCredit: 0, proposedDebit: 0, proposedCredit: 0,
    treatmentCounts: new Map<string, number>(),
  }

  for (const r of results) {
    console.log(`\n\n########## BOOK: ${r.book} ##########`)

    // --- 1. source vs proposed coverage ---
    const sourceTotals = sumBase1(r.lines)
    const proposedLines = r.entries.flatMap((e) => e.lines)
    const proposedTotals = sumBase1(proposedLines)
    const coveredVoucherEntryIds = new Set(proposedLines.map((l) => l.voucherEntryId))
    const sourceVoucherEntryIds = new Set(r.lines.map((l) => l.voucherEntryId))
    const missing = [...sourceVoucherEntryIds].filter((id) => !coveredVoucherEntryIds.has(id))
    const duplicated = proposedLines.length !== coveredVoucherEntryIds.size
    overall.sourceVouchers += r.vouchers.size
    overall.sourceLines += r.lines.length
    overall.proposedEntries += r.entries.length
    overall.proposedLines += proposedLines.length
    overall.sourceDebit += sourceTotals.debit
    overall.sourceCredit += sourceTotals.credit
    overall.proposedDebit += proposedTotals.debit
    overall.proposedCredit += proposedTotals.credit

    console.log(`\n[1] SOURCE vs PROPOSED COVERAGE (requirement 1: 100% line preservation)`)
    console.log(`    Source: ${r.vouchers.size} vouchers, ${r.lines.length} lines`)
    console.log(`    Proposed import: ${r.entries.length} journal entries, ${proposedLines.length} lines`)
    console.log(`    Line coverage: ${coveredVoucherEntryIds.size}/${r.lines.length} source lines represented exactly once (${pct(coveredVoucherEntryIds.size, r.lines.length)})`)
    console.log(`    Missing lines: ${missing.length}${missing.length ? ' -> ' + missing.slice(0, 20).join(',') : ''}`)
    console.log(`    Duplicated lines (same legacy line on >1 entry): ${duplicated ? 'YES - BUG' : 'none'}`)
    console.log(`    Source debit=${sourceTotals.debit}  credit=${sourceTotals.credit}`)
    console.log(`    Proposed debit=${round2(proposedTotals.debit)}  credit=${round2(proposedTotals.credit)}`)
    const unexplainedDebitDiff = round2(sourceTotals.debit - proposedTotals.debit)
    const unexplainedCreditDiff = round2(sourceTotals.credit - proposedTotals.credit)
    console.log(`    Unexplained difference: debit=${unexplainedDebitDiff}  credit=${unexplainedCreditDiff}  ${unexplainedDebitDiff === 0 && unexplainedCreditDiff === 0 ? '(ZERO - clean)' : '(NON-ZERO - INVESTIGATE)'}`)

    // --- entry-level balance check ---
    const unbalancedEntries = r.entries.map((e) => ({ e, b: entryBalance(e) })).filter(({ b }) => b.diff !== 0)
    console.log(`\n[2] PER-ENTRY BALANCE CHECK (every proposed journal entry must itself balance)`)
    console.log(`    ${r.entries.length} entries checked, ${unbalancedEntries.length} unbalanced`)
    if (unbalancedEntries.length) console.log(`      unbalanced: ${unbalancedEntries.slice(0, 10).map(({ e, b }) => `JV${e.legacyJvId}(${b.diff})`).join(', ')}`)

    // --- complex multi-line vouchers preserved ---
    const complexGroups = r.classified.filter((c) => c.treatment === 'unclassified_complex')
    const complexLineCount = complexGroups.reduce((s, c) => s + c.resolvedLines.length, 0)
    console.log(`\n[3] COMPLEX MULTI-LINE VOUCHERS (requirement 1: never forced into artificial 1:1 pairs)`)
    console.log(`    ${complexGroups.length} legacy vouchers contain a complex/multi-way split, totaling ${complexLineCount} lines - ALL preserved as multi-line historical journal entries`)
    if (complexGroups.length) console.log(`      JVIDs: ${complexGroups.map((c) => c.group.jvId).join(', ')}`)

    // --- opening balances ---
    const openingEntries = r.entries.filter((e) => e.entryKind === 'opening_balance')
    const splitEntries = r.entries.filter((e) => e.splitFromLegacyVoucher)
    const openingLineIds = new Set(openingEntries.flatMap((e) => e.lines.map((l) => l.voucherEntryId)))
    const standardLineIds = new Set(r.entries.filter((e) => e.entryKind === 'standard').flatMap((e) => e.lines.map((l) => l.voucherEntryId)))
    const overlap = [...openingLineIds].filter((id) => standardLineIds.has(id))
    console.log(`\n[4] OPENING BALANCES (requirement 7: exactly once, never also in operating replay)`)
    console.log(`    ${openingEntries.length} opening_balance entries, ${openingLineIds.size} lines total`)
    console.log(`    ${splitEntries.length} legacy vouchers had to be split (mixed opening + operating content in one legacy JVID)`)
    console.log(`    Lines appearing in BOTH an opening and a standard entry: ${overlap.length} ${overlap.length === 0 ? '(none - clean)' : '(BUG)'}`)
    for (const e of openingEntries) console.log(`      JV${e.legacyJvId}${e.splitFromLegacyVoucher ? ' (split)' : ''}  ${e.lines.length} lines  ${e.date}`)

    // --- account map ---
    const historicalAccounts = [...r.profiles.values()].filter((p) => p.targetCode?.startsWith('HIST-'))
    const lowConfidence = [...r.profiles.values()].filter((p) => p.confidence === 'low')
    const dynamic = [...r.profiles.values()].filter((p) => p.category === 'client')
    console.log(`\n[5] ACCOUNT MAP - ${r.profiles.size} accounts referenced`)
    console.log(`    ${r.profiles.size - historicalAccounts.length - dynamic.length} with a fixed real target; ${dynamic.length} client accounts resolved dynamically per-transaction; ${historicalAccounts.length} preserved as named historical sub-accounts (review required); ${lowConfidence.length} flagged low-confidence overall`)
    const accountMapCsv = ['legacy_account_id,legacy_account_number,legacy_name,category,target,counterparty_kind,confidence,evidence']
    for (const p of r.profiles.values()) {
      const display = p.category === 'client' ? 'DYNAMIC: AST-RECV / LIA-CLIENTADV / LIA-CLIENTFUNDS - resolved per line from running balance' : resolveCode(r.book, p.targetCode!).display
      accountMapCsv.push([p.account.accountId, p.account.accountNumber, csvEscape(p.account.mainName), p.category, csvEscape(display), p.counterpartyKind ?? '', p.confidence, csvEscape(p.evidence)].join(','))
    }
    csvRows[`account_map_${r.book}`] = accountMapCsv

    // --- counterparty proposals ---
    const counterparties = [...r.profiles.values()].filter((p) => p.counterpartyKind !== null)
    const cpNeedsReview = counterparties.filter((p) => p.counterpartyKind === 'other' || p.confidence === 'low')
    console.log(`\n[6] COUNTERPARTY PROPOSALS - ${counterparties.length} proposed (kind: ${kindBreakdown(counterparties)})`)
    console.log(`    ${cpNeedsReview.length} still need manual review/classification (ambiguous kind or low confidence)`)
    const linkedClients = counterparties.filter((p) => p.linkedClientId !== null)
    const linkedEmployees = counterparties.filter((p) => p.linkedEmployeeId !== null)
    console.log(`    Linked to existing Control clients: ${linkedClients.map((p) => `${p.account.mainName}->client#${p.linkedClientId}`).join(', ') || 'none'}`)
    console.log(`    Linked to existing Control employees: ${linkedEmployees.map((p) => `${p.account.mainName}->employee#${p.linkedEmployeeId}`).join(', ') || 'none'}`)
    const cpCsv = ['legacy_account_id,legacy_name,proposed_kind,confidence,needs_review,linked_client_id,linked_employee_id']
    for (const p of counterparties) cpCsv.push([p.account.accountId, csvEscape(p.account.mainName), p.counterpartyKind, p.confidence, cpNeedsReview.includes(p) ? 'yes' : 'no', p.linkedClientId ?? '', p.linkedEmployeeId ?? ''].join(','))
    csvRows[`counterparty_proposals_${r.book}`] = cpCsv

    // --- balance-driven client resolution demo ---
    const clientTargets = resolveClientLineTargets(r.book, r.profiles, r.lines)
    const clientAccounts = [...r.profiles.values()].filter((p) => p.category === 'client').sort((a, b) => r.lines.filter((l) => l.accountId === b.account.accountId).length - r.lines.filter((l) => l.accountId === a.account.accountId).length)
    if (clientAccounts.length) {
      console.log(`\n[6b] CLIENT ACCOUNT BALANCE-DRIVEN RESOLUTION (requirement 6: never from narration alone)`)
      for (const p of clientAccounts.slice(0, 4)) {
        const accLines = r.lines.filter((l) => l.accountId === p.account.accountId)
        const codes = accLines.map((l) => clientTargets.get(l.voucherEntryId)?.code)
        console.log(`    ${p.account.mainName.padEnd(38)} ${accLines.length} lines -> AST-RECV=${codes.filter((c) => c === 'AST-RECV').length}  LIA-CLIENTADV=${codes.filter((c) => c === 'LIA-CLIENTADV').length}  LIA-CLIENTFUNDS=${codes.filter((c) => c === 'LIA-CLIENTFUNDS').length}`)
      }
    }

    // --- job map ---
    const jobsForBook = JOB_MAP.filter((j) => j.book === r.book)
    const unmappedJobs = jobsForBook.filter((j) => !j.mappedProject)
    console.log(`\n[7] LEGACY JOB MAP (requirement 4: no fake Control projects; DNT mapping is PROPOSED, not confirmed)`)
    for (const j of jobsForBook) {
      const lineCount = r.lines.filter((l) => l.jobId === j.legacyJobId).length
      console.log(`    ${j.legacyJobCode} ${j.legacyJobName.padEnd(38)} lines=${lineCount}  -> ${j.mappedProject ? `PROPOSED (unconfirmed): Control project ${j.mappedProject}` : 'accounting_legacy_jobs (historical-only, no Control project)'}`)
    }

    // --- classification ---
    console.log(`\n[8] TRANSACTION CLASSIFICATION (${r.classified.length} groups, ${proposedLines.length} lines)`)
    const byTreatment = new Map<string, ClassifiedGroup[]>()
    for (const c of r.classified) {
      if (!byTreatment.has(c.treatment)) byTreatment.set(c.treatment, [])
      byTreatment.get(c.treatment)!.push(c)
      overall.treatmentCounts.set(c.treatment, (overall.treatmentCounts.get(c.treatment) ?? 0) + 1)
    }
    const autoClassified = r.classified.filter((c) => c.treatment !== 'needs_review' && c.treatment !== 'unclassified_complex')
    const historicalOnly = r.classified.filter((c) => c.treatment === 'needs_review' || c.treatment === 'unclassified_complex')
    for (const [t, list] of byTreatment) console.log(`    ${t.padEnd(28)} groups=${list.length}  lines=${list.reduce((s, c) => s + c.resolvedLines.length, 0)}`)
    console.log(`    => automatically classified: ${autoClassified.length}/${r.classified.length} groups (${pct(autoClassified.length, r.classified.length)})`)
    console.log(`    => historical-only/unclassified (still IMPORTED, just management-tag unresolved): ${historicalOnly.length}/${r.classified.length} groups (${pct(historicalOnly.length, r.classified.length)})`)

    const needsReviewCsv = ['jvid,amount,narration,matched_rule,lines']
    for (const c of historicalOnly) needsReviewCsv.push([c.group.jvId, c.amount, csvEscape(c.narration), c.matchedRule, c.resolvedLines.length].join(','))
    csvRows[`needs_review_${r.book}`] = needsReviewCsv

    // --- idempotency ---
    const ledgerPath = join(LEDGER_DIR, `${r.book}.json`)
    const keys = r.lines.map((l) => key(r.book, l.voucherEntryId))
    const batch = applyBatch(ledgerPath, keys)
    console.log(`\n[9] IDEMPOTENCY LEDGER (${ledgerPath})`)
    console.log(`    This run: ${batch.inserted} newly staged, ${batch.alreadyStaged} already staged, ${batch.total} total lines`)

    // --- trial balance reconciliation (post-remap) ---
    const byTargetCode = new Map<string, { debit: number; credit: number }>()
    for (const l of proposedLines) {
      const e = byTargetCode.get(l.targetCode) ?? { debit: 0, credit: 0 }
      e.debit += l.debit ?? 0
      e.credit += l.credit ?? 0
      byTargetCode.set(l.targetCode, e)
    }
    const tbDebit = round2([...byTargetCode.values()].reduce((s, v) => s + v.debit, 0))
    const tbCredit = round2([...byTargetCode.values()].reduce((s, v) => s + v.credit, 0))
    console.log(`\n[10] TRIAL BALANCE RECONCILIATION (post-remap, by target account)`)
    console.log(`    ${byTargetCode.size} distinct target accounts, total debit=${tbDebit}  credit=${tbCredit}  diff=${round2(tbDebit - tbCredit)}`)

    // --- cash/bank reconciliation ---
    const cashBankCodes = new Set(['AST-CASH', 'AST-BANK', 'AST-PETTY'])
    const sourceCashBankAccounts = [...r.profiles.values()].filter((p) => p.category === 'cash' || p.category === 'bank' || p.category === 'petty_cash')
    const sourceCashBankNet = round2(sourceCashBankAccounts.reduce((s, p) => s + r.lines.filter((l) => l.accountId === p.account.accountId).reduce((s2, l) => s2 + (l.base1Credit ?? 0) - (l.base1Debit ?? 0), 0), 0))
    const proposedCashBankNet = round2(proposedLines.filter((l) => cashBankCodes.has(l.targetCode)).reduce((s, l) => s + (l.credit ?? 0) - (l.debit ?? 0), 0))
    console.log(`\n[11] CASH/BANK RECONCILIATION`)
    console.log(`    Source net movement across all legacy cash/bank/petty-cash accounts: ${-sourceCashBankNet} (net debit = net cash increase)`)
    console.log(`    Proposed net movement across AST-CASH/AST-BANK/AST-PETTY: ${-proposedCashBankNet}`)
    console.log(`    Difference: ${round2(sourceCashBankNet - proposedCashBankNet)} ${sourceCashBankNet === proposedCashBankNet ? '(ZERO - clean)' : '(INVESTIGATE)'}`)

    // --- account-balance snapshot reconciliation (independent check against the legacy system's OWN stored summaries) ---
    // accountsbalances carries per-month rows (FiscalMonth 1-12) PLUS a FiscalMonth=13 annual-total row AND a
    // FiscalYear=9999/FiscalMonth=13 all-time-total row that duplicate the same figures - summing everything
    // would triple-count. Only the true monthly detail rows are additive.
    const snapshotByAccount = new Map<number, { debit: number; credit: number }>()
    for (const b of r.balances) {
      if (b.fiscalMonth === null || b.fiscalMonth < 1 || b.fiscalMonth > 12) continue
      const e = snapshotByAccount.get(b.accountId) ?? { debit: 0, credit: 0 }
      e.debit += b.base1Debit ?? 0
      e.credit += b.base1Credit ?? 0
      snapshotByAccount.set(b.accountId, e)
    }
    let snapshotMismatches = 0
    let snapshotChecked = 0
    for (const [accountId, snap] of snapshotByAccount) {
      const linesForAccount = r.lines.filter((l) => l.accountId === accountId)
      if (linesForAccount.length === 0) continue
      const computed = sumBase1(linesForAccount)
      snapshotChecked++
      if (Math.abs(computed.debit - snap.debit) > 0.1 || Math.abs(computed.credit - snap.credit) > 0.1) snapshotMismatches++
    }
    console.log(`\n[12] ACCOUNT-BALANCE SNAPSHOT RECONCILIATION (vs legacy accountsbalances table, independent of our classification)`)
    console.log(`    ${snapshotChecked} accounts cross-checked, ${snapshotMismatches} mismatched vs the legacy system's own stored period totals`)

    jsonOut[`entries_sample_${r.book}`] = sampleTransactions(r)
    jsonOut[`summary_${r.book}`] = {
      sourceVouchers: r.vouchers.size, sourceLines: r.lines.length,
      proposedEntries: r.entries.length, proposedLines: proposedLines.length,
      coverage: pct(coveredVoucherEntryIds.size, r.lines.length), missingLines: missing.length,
      sourceTotals, proposedTotals: { debit: round2(proposedTotals.debit), credit: round2(proposedTotals.credit) },
      unexplainedDebitDiff, unexplainedCreditDiff,
      complexVouchersPreserved: complexGroups.length, complexLines: complexLineCount,
      openingEntries: openingEntries.length, splitVouchers: splitEntries.length, openingOverlapWithStandard: overlap.length,
      autoClassified: autoClassified.length, historicalOnlyUnclassified: historicalOnly.length,
      accountsNeedingReview: historicalAccounts.length + lowConfidence.length,
      counterpartiesNeedingReview: cpNeedsReview.length,
      legacyJobsUnmapped: unmappedJobs.length,
      idempotency: batch,
      trialBalance: { debit: tbDebit, credit: tbCredit, diff: round2(tbDebit - tbCredit) },
      cashBankReconciliation: { source: -sourceCashBankNet, proposed: -proposedCashBankNet, diff: round2(sourceCashBankNet - proposedCashBankNet) },
      snapshotReconciliation: { checked: snapshotChecked, mismatches: snapshotMismatches },
    }
  }

  console.log(`\n\n########## OVERALL (both books) ##########`)
  console.log(`Source: ${overall.sourceVouchers} vouchers, ${overall.sourceLines} lines`)
  console.log(`Proposed: ${overall.proposedEntries} entries, ${overall.proposedLines} lines`)
  console.log(`Line coverage: ${pct(overall.proposedLines, overall.sourceLines)}`)
  console.log(`Source debit=${round2(overall.sourceDebit)}  credit=${round2(overall.sourceCredit)}`)
  console.log(`Proposed debit=${round2(overall.proposedDebit)}  credit=${round2(overall.proposedCredit)}`)
  console.log(`Unexplained difference: debit=${round2(overall.sourceDebit - overall.proposedDebit)}  credit=${round2(overall.sourceCredit - overall.proposedCredit)}`)
  console.log(`Treatment totals (groups):`)
  for (const [t, n] of overall.treatmentCounts) console.log(`  ${t.padEnd(28)} ${n}`)

  // --- historical account registry (for the migration list) ---
  const registry = getHistoricalAccountRegistry()
  console.log(`\n\n########## HISTORICAL SUB-ACCOUNTS REQUIRING CREATION (${registry.length}) ##########`)
  const histCsv = ['book,code,name,type,parent,legacy_account_number,net_balance']
  for (const h of registry) {
    console.log(`  ${h.book.padEnd(12)} ${h.code.padEnd(16)} ${h.name.padEnd(55)} [${h.type}] parent=${h.parentCode} net=${h.netBalance}`)
    histCsv.push([h.book, h.code, csvEscape(h.name), h.type, h.parentCode, h.legacyAccountNumber, h.netBalance].join(','))
  }
  csvRows['historical_accounts_required'] = histCsv

  console.log(`\n\n########## PROPOSED NEW CHART ACCOUNTS REQUIRED (${PROPOSED_NEW_ACCOUNTS.length + HISTORICAL_ACCOUNT_ROOTS.length}) ##########`)
  for (const a of HISTORICAL_ACCOUNT_ROOTS) console.log(`  ${a.book.padEnd(12)} ${a.code.padEnd(16)} ${a.name} [${a.type}]`)
  for (const a of PROPOSED_NEW_ACCOUNTS) console.log(`  ${a.book.padEnd(12)} ${a.code.padEnd(16)} ${a.name} [${a.type}]`)

  console.log(`\n\n########## SCHEMA FINDINGS ##########`)
  console.log(`- accounting_counterparties.kind has no 'partner' value; Omar/Ramadan/Cash Partners need a schema change (widen the CHECK constraint) OR a documented decision to use kind='other' with a note.`)
  console.log(`- LIA-CLIENTADV, CEXP-UTILITIES, CEXP-TELECOM, CEXP-MAINTENANCE, and SARL's full project-cost chart do not exist live yet - see PROPOSED NEW CHART ACCOUNTS above.`)
  console.log(`- ${registry.length} legacy accounts could not be confidently classified and are preserved as named historical sub-accounts under HIST-*-ROOT grouping accounts - see the list above and historical_accounts_required.csv.`)

  for (const [name, rows] of Object.entries(csvRows)) writeFileSync(join(REPORTS_DIR, `${name}.csv`), rows.join('\n'))
  writeFileSync(join(REPORTS_DIR, 'dry_run_report.json'), JSON.stringify(jsonOut, null, 2))
  console.log(`\n\nArtifacts written to: ${REPORTS_DIR}`)
}

function csvEscape(s: string | number): string {
  return `"${String(s ?? '').replace(/"/g, '""')}"`
}
function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${round2((n / total) * 100)}%`
}
function kindBreakdown(list: AccountProfile[]): string {
  const m = new Map<string, number>()
  for (const p of list) m.set(p.counterpartyKind!, (m.get(p.counterpartyKind!) ?? 0) + 1)
  return [...m.entries()].map(([k, v]) => `${k}=${v}`).join(', ')
}
function accName(r: BookResult, accountId: number): string {
  const a = r.accounts.get(accountId)
  return a ? `${a.accountNumber} ${a.mainName}` : `#${accountId}`
}
function sampleTransactions(r: BookResult) {
  const wanted = ['opening_balance', 'payroll', 'partner_funding', 'client_project_funds_held', 'professional_fee_revenue', 'client_advance_unallocated', 'client_receivable_settlement', 'supplier_payable_cost', 'cash_bank_transfer', 'unclassified_complex', 'needs_review']
  const out: Record<string, unknown[]> = {}
  for (const t of wanted) {
    const matches = r.classified.filter((c) => c.treatment === t).slice(0, 2)
    out[t] = matches.map((c) => ({
      legacy_jvid: c.group.jvId,
      amount_base1_usd: c.amount,
      narration: c.narration,
      legacy_job_id: c.jobId,
      mapped_control_project: c.jobMappedProjectKey,
      matched_rule: c.matchedRule,
      lines: c.resolvedLines.map((l) => ({
        legacy_account: accName(r, l.accountId),
        debit: l.debit, credit: l.credit,
        legacy_base2_lbp: l.base2Debit ?? l.base2Credit,
        legacy_fx_rate: l.base2Debit && l.debit ? round2(l.base2Debit / l.debit) : l.base2Credit && l.credit ? round2(l.base2Credit / l.credit) : null,
        target: resolveCode(r.book, l.targetCode).display,
      })),
    }))
  }
  return out
}

main().catch((err) => {
  console.error('Dry run failed:', err)
  process.exitCode = 1
})
