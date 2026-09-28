// Local, offline dry-run pipeline for the Polypus -> Phase 1B historical import.
// Reads the legacy mysqldump files directly from disk (never copied into the repo), stages everything as
// plain JS objects in memory plus a small on-disk idempotency ledger, and produces mapping/classification/
// reconciliation reports. NEVER opens a database connection - see run.ts for the on-disk staging paths.
import { loadTables, num, Row } from './parse'
import {
  BOOK_TARGET,
  LegacyBookCode,
  LIVE_ACCOUNTS,
  PROPOSED_NEW_ACCOUNTS,
  HISTORICAL_ACCOUNT_ROOTS,
  CONTROL_CLIENTS,
  CONTROL_EMPLOYEES,
  JOB_MAP,
  JV_TYPE_CODE,
  COST_KEYWORD_RULES,
  CASH_IN_NARRATION,
  CASH_OUT_NARRATION,
  FEE_INVOICE_NARRATION,
  OPENING_NARRATION,
} from './reference'

// ---------- legacy row shapes ----------

export type LegacyAccount = {
  accountId: number
  currencyId: number | null
  accountNumber: string | null
  mainName: string
}
export type LegacyJournalVoucher = { jvId: number; jvNumber: number | null; jvDate: string }
export type LegacyLine = {
  voucherEntryId: number
  jvId: number
  accountId: number
  jvTypeId: number | null
  jobId: number | null
  entryNumber: number
  reference: string | null
  base1Debit: number | null
  base1Credit: number | null
  base2Debit: number | null
  base2Credit: number | null
  foreignCurrency: number | null
  valueDate: string | null
  narration: string
  userReference: string | null
  rate: number | null
  currencyId: number | null
}
export type LegacyJob = { jobId: number; jobCode: string; mainName: string }
export type LegacyAccountBalance = { accountId: number; fiscalYear: number | null; fiscalMonth: number | null; base1Debit: number | null; base1Credit: number | null }

function loadAccounts(rows: Row[]): Map<number, LegacyAccount> {
  const m = new Map<number, LegacyAccount>()
  for (const r of rows) {
    const id = num(r[0])!
    m.set(id, { accountId: id, currencyId: num(r[1]), accountNumber: r[3], mainName: r[4] ?? '' })
  }
  return m
}
function loadVouchers(rows: Row[]): Map<number, LegacyJournalVoucher> {
  const m = new Map<number, LegacyJournalVoucher>()
  for (const r of rows) m.set(num(r[0])!, { jvId: num(r[0])!, jvNumber: num(r[1]), jvDate: r[2] ?? '' })
  return m
}
function loadLines(rows: Row[]): LegacyLine[] {
  return rows.map((r) => ({
    voucherEntryId: num(r[0])!,
    jvId: num(r[1])!,
    accountId: num(r[2])!,
    jvTypeId: num(r[3]),
    jobId: num(r[4]),
    entryNumber: num(r[5]) ?? 0,
    reference: r[6],
    base1Debit: num(r[7]),
    base1Credit: num(r[8]),
    base2Debit: num(r[9]),
    base2Credit: num(r[10]),
    foreignCurrency: num(r[11]),
    valueDate: r[12],
    narration: (r[13] ?? '').replace(/\r\n/g, ' / '),
    userReference: r[14],
    rate: num(r[16]),
    currencyId: num(r[17]),
  }))
}
function loadJobs(rows: Row[]): LegacyJob[] {
  return rows.map((r) => ({ jobId: num(r[0])!, jobCode: r[2] ?? '', mainName: r[3] ?? '' }))
}
function loadAccountsBalances(rows: Row[]): LegacyAccountBalance[] {
  // accountsbalances: AccountBalanceID,AccountID,FiscalYear,FiscalMonth,IsPosted,Base1Debit,Base1Credit,...
  return rows.map((r) => ({ accountId: num(r[1])!, fiscalYear: num(r[2]), fiscalMonth: num(r[3]), base1Debit: num(r[5]), base1Credit: num(r[6]) }))
}

// ---------- pair grouping (JVID -> matched debit/credit line pairs) ----------

export type PairGroup = {
  id: string // {book}:{jvid}:{firstEntryNumber}
  book: LegacyBookCode
  jvId: number
  jvDate: string
  lines: LegacyLine[] // 2 lines for a clean pair, >2 for an unresolved/complex group
  status: 'clean_pair' | 'unbalanced_complex'
  amount: number // absolute Base1 amount of the pair (0 for complex groups spanning mixed amounts)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function buildPairGroups(book: LegacyBookCode, vouchers: Map<number, LegacyJournalVoucher>, lines: LegacyLine[]): PairGroup[] {
  const byJv = new Map<number, LegacyLine[]>()
  for (const l of lines) {
    if (!byJv.has(l.jvId)) byJv.set(l.jvId, [])
    byJv.get(l.jvId)!.push(l)
  }
  const groups: PairGroup[] = []
  for (const [jvId, jvLines] of byJv) {
    const sorted = [...jvLines].sort((a, b) => a.entryNumber - b.entryNumber)
    const used = new Set<number>()
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i]
      if (used.has(a.voucherEntryId)) continue
      const aAmt = a.base1Debit ?? a.base1Credit ?? 0
      const aSide = a.base1Debit !== null ? 'debit' : 'credit'
      let matchIdx = -1
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j]
        if (used.has(b.voucherEntryId)) continue
        const bAmt = b.base1Debit ?? b.base1Credit ?? 0
        const bSide = b.base1Debit !== null ? 'debit' : 'credit'
        if (bSide !== aSide && round2(bAmt) === round2(aAmt)) {
          matchIdx = j
          break
        }
      }
      if (matchIdx >= 0) {
        const b = sorted[matchIdx]
        used.add(a.voucherEntryId)
        used.add(b.voucherEntryId)
        groups.push({
          id: `${book}:${jvId}:${a.entryNumber}`,
          book,
          jvId,
          jvDate: vouchers.get(jvId)?.jvDate ?? '',
          lines: [a, b],
          status: 'clean_pair',
          amount: round2(aAmt),
        })
      }
    }
    const leftover = sorted.filter((l) => !used.has(l.voucherEntryId))
    if (leftover.length > 0) {
      groups.push({
        id: `${book}:${jvId}:complex`,
        book,
        jvId,
        jvDate: vouchers.get(jvId)?.jvDate ?? '',
        lines: leftover,
        status: 'unbalanced_complex',
        amount: 0,
      })
    }
  }
  return groups
}

// ---------- account category classification ----------

export type AccountCategory =
  | 'cash' | 'bank' | 'petty_cash'
  | 'supplier_payable' | 'client_receivable_ambiguous' | 'client' | 'payee_like'
  | 'salary' | 'partner' | 'equity_capital' | 'cost' | 'company_opex' | 'income_fees' | 'income_other'
  | 'template_unused' | 'other'

export type AccountProfile = {
  account: LegacyAccount
  category: AccountCategory
  targetCode: string | null // live or PROPOSED_NEW_ACCOUNTS code
  counterpartyKind: 'worker' | 'contractor' | 'supplier' | 'consultant' | 'employee' | 'client' | 'government' | 'partner' | 'other' | null
  confidence: 'high' | 'medium' | 'low'
  evidence: string
  linkedClientId: number | null
  linkedEmployeeId: number | null
}

function prefixCategory(accountNumber: string, mainName: string): AccountCategory {
  const n = accountNumber
  if (/^531/.test(n)) return n.includes('112') || /petty/i.test(mainName) ? 'petty_cash' : 'cash'
  if (/^53/.test(n)) return 'cash'
  if (/^512/.test(n) || /^51/.test(n)) return 'bank'
  if (/^4011/.test(n)) return 'supplier_payable'
  if (/^40/.test(n)) return 'supplier_payable'
  if (/^4111/.test(n)) return 'client_receivable_ambiguous'
  if (/^41/.test(n)) return 'client_receivable_ambiguous'
  if (/^4210/.test(n)) return 'salary'
  if (/^42|^43/.test(n)) return 'salary'
  if (/^4510|^45/.test(n)) return 'partner'
  if (/^1[02]/.test(n)) return 'equity_capital' // 10=Capital, 12=Profit/Loss Brought Forward - both equity carryforward
  if (/^6[012]/.test(n)) return 'cost' // 60=Purchases (this chart also reuses it for bank commissions/discounts)
  if (/^6[34]/.test(n)) return 'company_opex'
  if (/^7[01]/.test(n)) return 'income_fees'
  if (/^7[6789]/.test(n)) return 'income_other'
  return 'template_unused'
}

function nameMatch(name: string, candidates: { id: number; name: string }[]): number | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const target = norm(name)
  for (const c of candidates) {
    const cn = norm(c.name)
    if (target === cn || (cn.length > 2 && target.includes(cn)) || (target.length > 2 && cn.includes(target))) return c.id
  }
  return null
}

function costTargetCode(mainName: string, hasJob: boolean, book: LegacyBookCode): { code: string; confidence: 'high' | 'medium' | 'low' } {
  for (const rule of COST_KEYWORD_RULES) {
    if (rule.pattern.test(mainName)) return { code: rule.code, confidence: 'high' }
  }
  const fallback = book === 'NEXTUDIOSARL' ? 'EXP-OTHERPROJECT' : hasJob ? 'EXP-OTHERPROJECT' : 'CEXP-OTHEROPEX'
  return { code: fallback, confidence: 'low' }
}

// Requirement 1/2/3: NOTHING is ever left with a null target. Any account this pipeline cannot confidently
// classify into a real operating/balance-sheet category gets its OWN, individually-named historical
// sub-account (never merged with another account, never dumped into a generic "Other" bucket) - "Legacy:
// <original name>", filed under the matching HIST-*-ROOT grouping account for its book. Type is inferred
// from the account's own net Base1 balance direction (universal double-entry convention: net debit reads as
// asset/expense-like, net credit as liability-like) and its legacy number-prefix class - never a Lebanese
// statutory/tax position. The registry is keyed by book+legacyAccountId so the same account always resolves
// to the same historical code, and is exposed via getHistoricalAccountRegistry() for the migration/report.
export type HistoricalAccountDef = { book: LegacyBookCode; code: string; name: string; type: string; parentCode: string; legacyAccountId: number; legacyAccountNumber: string; netBalance: number }
const historicalRegistry = new Map<string, HistoricalAccountDef>()

function historicalAccountFor(book: LegacyBookCode, profile: AccountProfile, accLines: LegacyLine[]): HistoricalAccountDef {
  const key = `${book}:${profile.account.accountId}`
  const existing = historicalRegistry.get(key)
  if (existing) return existing
  const net = round2(accLines.reduce((s, l) => s + (l.base1Credit ?? 0) - (l.base1Debit ?? 0), 0))
  const numPrefix = (profile.account.accountNumber ?? '')[0] ?? ''
  let type: string
  let parentCode: string
  if (numPrefix >= '6') {
    type = 'expense'
    parentCode = 'HIST-EXP-ROOT'
  } else if (numPrefix === '4') {
    // A people/misc-party account we couldn't classify: liability-like (they're owed) if net credit,
    // asset-like (they owe / it's a recoverable) if net debit.
    if (net > 0) { type = 'liability'; parentCode = 'HIST-LIA-ROOT' } else { type = 'asset'; parentCode = 'HIST-AST-ROOT' }
  } else {
    type = 'asset'
    parentCode = 'HIST-AST-ROOT'
  }
  const def: HistoricalAccountDef = {
    book, code: `HIST-${profile.account.accountNumber}`, name: `Legacy: ${profile.account.mainName} (historical - review required)`,
    type, parentCode, legacyAccountId: profile.account.accountId, legacyAccountNumber: profile.account.accountNumber ?? '', netBalance: net,
  }
  historicalRegistry.set(key, def)
  return def
}
export function getHistoricalAccountRegistry(): HistoricalAccountDef[] {
  return [...historicalRegistry.values()]
}
export function clearHistoricalAccountRegistry() {
  historicalRegistry.clear()
}

// Builds a category/target-code profile for every account actually referenced by at least one line.
// Ambiguous 41-range accounts get resolved from the DATA (which leg they pair with, which narration),
// not from the number prefix alone - the prefix is only a starting hypothesis.
export function classifyAccounts(book: LegacyBookCode, accounts: Map<number, LegacyAccount>, lines: LegacyLine[]): Map<number, AccountProfile> {
  const usedIds = new Set(lines.map((l) => l.accountId))
  const profiles = new Map<number, AccountProfile>()

  for (const id of usedIds) {
    const acc = accounts.get(id)
    if (!acc) continue
    const num0 = acc.accountNumber ?? ''
    const cat = prefixCategory(num0, acc.mainName)
    profiles.set(id, { account: acc, category: cat, targetCode: null, counterpartyKind: null, confidence: 'medium', evidence: 'prefix ' + num0, linkedClientId: null, linkedEmployeeId: null })
  }

  // Evidence pass for ambiguous 411x accounts: look at every line on that account and see whether the
  // OTHER leg of its pair is cash/bank (funds movement) + narration direction, or a cost/expense account
  // (payable-style settlement).
  const linesByAccount = new Map<number, LegacyLine[]>()
  for (const l of lines) {
    if (!linesByAccount.has(l.accountId)) linesByAccount.set(l.accountId, [])
    linesByAccount.get(l.accountId)!.push(l)
  }
  const linesByJv = new Map<number, LegacyLine[]>()
  for (const l of lines) {
    if (!linesByJv.has(l.jvId)) linesByJv.set(l.jvId, [])
    linesByJv.get(l.jvId)!.push(l)
  }

  for (const [id, profile] of profiles) {
    if (profile.category !== 'client_receivable_ambiguous') continue
    let clientEvidence = 0
    let payeeEvidence = 0
    let feeEvidence = 0
    const accLines = linesByAccount.get(id) ?? []
    for (const l of accLines) {
      const jvLines = linesByJv.get(l.jvId) ?? []
      const other = jvLines.find((x) => x.accountId !== id)
      const otherCat = other ? profiles.get(other.accountId)?.category ?? prefixCategory((accounts.get(other.accountId)?.accountNumber) ?? '', '') : null
      if (FEE_INVOICE_NARRATION.test(l.narration)) feeEvidence++
      else if (CASH_IN_NARRATION.test(l.narration) && (otherCat === 'cash' || otherCat === 'bank')) clientEvidence++
      else if (CASH_OUT_NARRATION.test(l.narration) && (otherCat === 'cash' || otherCat === 'bank' || otherCat === 'cost')) payeeEvidence++
      else if (otherCat === 'cash' || otherCat === 'bank') clientEvidence += 0.5
    }
    const total = clientEvidence + payeeEvidence + feeEvidence
    if (total === 0) {
      profile.category = 'other'
      profile.confidence = 'low'
      profile.evidence = 'no funds-movement or fee evidence found on this account'
    } else if (feeEvidence > 0 || clientEvidence >= payeeEvidence * 2) {
      profile.category = 'client'
      profile.confidence = payeeEvidence === 0 ? 'high' : clientEvidence >= payeeEvidence * 3 ? 'medium' : 'low'
      profile.evidence = `client-in evidence=${clientEvidence}, fee-invoice evidence=${feeEvidence}, payee-out evidence=${payeeEvidence}`
      if (payeeEvidence > 0) profile.confidence = 'low' // mixed signal (e.g. Chebly Contracting) -> flagged for manual review
    } else if (payeeEvidence > clientEvidence) {
      profile.category = 'payee_like'
      profile.confidence = clientEvidence === 0 ? 'high' : 'low'
      profile.evidence = `payee-out evidence=${payeeEvidence}, client-in evidence=${clientEvidence}, fee-invoice evidence=${feeEvidence}`
    } else {
      profile.category = 'other'
      profile.confidence = 'low'
      profile.evidence = `tied evidence: client=${clientEvidence}, payee=${payeeEvidence}, fee=${feeEvidence} - needs manual review`
    }
    // A thin sample should never read as "high confidence": an account seen once or twice isn't as
    // trustworthy as one (like Rabih Sebai, 63 observations) with a large, one-directional history.
    if (total < 1.5 && profile.confidence !== 'low') {
      profile.confidence = 'low'
      profile.evidence += ' [downgraded: only ' + total + ' observation(s)]'
    } else if (total < 3 && profile.confidence === 'high') {
      profile.confidence = 'medium'
      profile.evidence += ' [downgraded from high: only ' + total + ' observations]'
    }
  }

  // Resolve target codes + counterparty kind + Control links.
  for (const [id, profile] of profiles) {
    const hasJob = accLinesHaveJob(linesByAccount.get(id) ?? [])
    switch (profile.category) {
      case 'cash':
        profile.targetCode = 'AST-CASH'
        break
      case 'petty_cash':
        profile.targetCode = book === 'NEXTUDIOSARL' ? 'AST-CASH' : 'AST-PETTY'
        break
      case 'bank':
        profile.targetCode = 'AST-BANK'
        break
      case 'supplier_payable': {
        profile.targetCode = 'LIA-PAYABLES'
        profile.counterpartyKind = 'supplier'
        profile.confidence = 'high'
        break
      }
      case 'client': {
        // No static target: requirement 1 forbids defaulting a client account to AST-RECV. The real target
        // (AST-RECV vs LIA-CLIENTADV vs LIA-CLIENTFUNDS) depends on that account's RUNNING BALANCE at the
        // time of each line - see resolveClientLineTargets() below, consulted per-line by classifyGroups.
        profile.targetCode = null
        profile.counterpartyKind = 'client'
        const cid = nameMatch(profile.account.mainName, CONTROL_CLIENTS)
        profile.linkedClientId = cid
        break
      }
      case 'payee_like': {
        profile.targetCode = 'LIA-PAYABLES'
        profile.counterpartyKind = 'contractor'
        break
      }
      case 'other': {
        profile.targetCode = null // decided per-transaction by the classifier (needs_review)
        profile.counterpartyKind = 'other'
        break
      }
      case 'salary': {
        profile.targetCode = hasJob ? 'EXP-LABOR' : 'CEXP-SALARIES'
        profile.counterpartyKind = 'employee'
        const eid = nameMatch(profile.account.mainName.replace(/^salary\s+/i, ''), CONTROL_EMPLOYEES)
        profile.linkedEmployeeId = eid
        profile.confidence = eid ? 'high' : 'medium'
        break
      }
      case 'partner': {
        profile.targetCode = 'LIA-PARTNER'
        profile.counterpartyKind = 'partner' // schema's counterparty.kind enum now includes 'partner' - approved and migrated
        break
      }
      case 'equity_capital': {
        profile.targetCode = 'EQ-OPENING'
        profile.confidence = 'high'
        break
      }
      case 'cost': {
        const r = costTargetCode(profile.account.mainName, hasJob, book)
        profile.targetCode = r.code
        profile.counterpartyKind = null
        profile.confidence = r.confidence
        break
      }
      case 'company_opex': {
        const r = costTargetCode(profile.account.mainName, false, book)
        profile.targetCode = r.code
        profile.confidence = r.confidence
        break
      }
      case 'income_fees':
        profile.targetCode = 'INC-FEES'
        break
      case 'income_other':
        profile.targetCode = 'INC-OTHER'
        break
      case 'template_unused':
        profile.targetCode = null
        profile.confidence = 'low'
        break
    }
  }

  // Requirement 1/2: guarantee coverage - anything still unresolved (and not 'client', which resolves
  // dynamically per-line) becomes its own named historical sub-account. Nothing is left null.
  for (const [id, profile] of profiles) {
    if (profile.targetCode === null && profile.category !== 'client') {
      const def = historicalAccountFor(book, profile, linesByAccount.get(id) ?? [])
      profile.targetCode = def.code
      profile.confidence = 'low'
    }
  }
  return profiles
}

function accLinesHaveJob(lines: LegacyLine[]): boolean {
  return lines.some((l) => l.jobId !== null)
}

// ---------- classification of pair groups into a treatment ----------

export type Treatment =
  | 'opening_balance' | 'payroll' | 'partner_funding' | 'client_project_funds_held'
  | 'professional_fee_revenue' | 'client_advance_unallocated' | 'client_receivable_settlement'
  | 'supplier_payable_cost' | 'cash_bank_transfer' | 'needs_review' | 'unclassified_complex'

// One legacy line, fully resolved to an import target - used for BOTH clean pairs and complex multi-line
// groups. This is what guarantees requirement 1 (100% line coverage): every LegacyLine produces exactly one
// ResolvedLine with a non-null targetCode, whether or not the pipeline could confidently classify its
// business meaning (see historicalAccountFor above for the "couldn't classify" fallback).
export type ResolvedLine = {
  voucherEntryId: number
  accountId: number
  targetCode: string
  debit: number | null
  credit: number | null
  base2Debit: number | null
  base2Credit: number | null
  foreignCurrency: number | null
  nativeCurrencyId: number | null
  rate: number | null
  jobId: number | null
  jvTypeId: number | null
  narration: string
  reference: string | null
  userReference: string | null
}

export type ClassifiedGroup = {
  group: PairGroup
  treatment: Treatment
  matchedRule: string
  confidence: 'high' | 'medium' | 'low'
  amount: number
  jobId: number | null
  jobMappedProjectKey: string | null
  narration: string
  resolvedLines: ResolvedLine[] // 2 for a clean pair, N (>=1) for a complex/leftover group - never dropped
}

// Requirement 1: a client account must never default to AST-RECV. Its real target depends on that specific
// account's RUNNING BALANCE at the moment of each line - credit increases the balance (money received/owed
// TO the client, i.e. an advance/held-funds liability), debit decreases it (an invoice draws the advance
// down, or, once the balance goes negative, creates/grows a genuine receivable). AST-RECV is used ONLY while
// the running balance is negative (the client actually owes Nextudio) - exactly "receivable or settlement",
// never a prepaid advance. This walks each client account's own lines in chronological order once.
export type ClientLineTarget = { code: string; balanceBefore: number; balanceAfter: number }

export function resolveClientLineTargets(book: LegacyBookCode, profiles: Map<number, AccountProfile>, lines: LegacyLine[]): Map<number, ClientLineTarget> {
  const jobMapForBook = new Map(JOB_MAP.filter((j) => j.book === book).map((j) => [j.legacyJobId, j]))
  const result = new Map<number, ClientLineTarget>()
  const byAccount = new Map<number, LegacyLine[]>()
  for (const l of lines) {
    if (profiles.get(l.accountId)?.category !== 'client') continue
    if (!byAccount.has(l.accountId)) byAccount.set(l.accountId, [])
    byAccount.get(l.accountId)!.push(l)
  }
  for (const [, accLines] of byAccount) {
    const sorted = [...accLines].sort((a, b) => {
      const da = a.valueDate ?? ''
      const db = b.valueDate ?? ''
      if (da !== db) return da < db ? -1 : 1
      if (a.jvId !== b.jvId) return a.jvId - b.jvId
      return a.entryNumber - b.entryNumber
    })
    let balance = 0
    for (const l of sorted) {
      const balanceBefore = balance
      const job = l.jobId !== null ? jobMapForBook.get(l.jobId) : undefined
      const liabilityCode = job?.mappedProject ? 'LIA-CLIENTFUNDS' : 'LIA-CLIENTADV'
      const isCredit = l.base1Credit !== null
      // Direction-aware: a CREDIT (money coming in) only settles a receivable while the balance is already
      // negative (they owed us) - otherwise it's a fresh/growing advance. A DEBIT (an invoice/charge) only
      // draws down an EXISTING advance while the balance is positive - starting from zero (or already
      // negative), a debit creates/grows a genuine receivable instead. Getting this backwards would wrongly
      // draw down a liability that was never funded (e.g. invoicing a client before they ever prepaid).
      const code = isCredit ? (balanceBefore < -0.01 ? 'AST-RECV' : liabilityCode) : (balanceBefore > 0.01 ? liabilityCode : 'AST-RECV')
      const delta = (l.base1Credit ?? 0) - (l.base1Debit ?? 0)
      balance = round2(balance + delta)
      result.set(l.voucherEntryId, { code, balanceBefore, balanceAfter: balance })
    }
  }
  return result
}

export function classifyGroups(
  book: LegacyBookCode,
  groups: PairGroup[],
  profiles: Map<number, AccountProfile>,
  openingCandidateIds: Set<string>
): ClassifiedGroup[] {
  const allLines = groups.flatMap((g) => g.lines)
  const clientTargets = resolveClientLineTargets(book, profiles, allLines)
  // Requirement 1: guaranteed non-null - classifyAccounts() now resolves every account to either a real
  // target or its own historical sub-account (see historicalAccountFor). 'client' accounts resolve here.
  const targetFor = (l: LegacyLine): string =>
    clientTargets.get(l.voucherEntryId)?.code ?? profiles.get(l.accountId)?.targetCode ?? `HIST-UNRESOLVED-${l.accountId}`
  const toResolvedLine = (l: LegacyLine): ResolvedLine => ({
    voucherEntryId: l.voucherEntryId, accountId: l.accountId, targetCode: targetFor(l),
    debit: l.base1Debit, credit: l.base1Credit, base2Debit: l.base2Debit, base2Credit: l.base2Credit,
    foreignCurrency: l.foreignCurrency, nativeCurrencyId: l.currencyId, rate: l.rate, jobId: l.jobId,
    jvTypeId: l.jvTypeId, narration: l.narration, reference: l.reference, userReference: l.userReference,
  })
  const jobMapForBook = new Map(JOB_MAP.filter((j) => j.book === book).map((j) => [j.legacyJobId, j]))
  const out: ClassifiedGroup[] = []

  for (const g of groups) {
    if (g.status !== 'clean_pair') {
      // Requirement 1: a complex/unpaired group is NEVER dropped - every one of its lines still gets a fully
      // resolved import target, just without a confident business-meaning label (management review only).
      //
      // Safety-critical exception: if ANY line in this group touches the Capital/equity_capital account
      // (targets EQ-OPENING), the WHOLE group must be tagged opening_balance, exactly like Rule 0 below does
      // for clean pairs - otherwise assembleJournalEntries would file it as a 'standard' entry, and the live
      // schema's EQ-OPENING guard trigger would reject the whole entry at insert time. Proven necessary by
      // SARL JVID 13: a genuine 7-line opening voucher narrated simply "opening" (not any of the phrases
      // findOpeningCandidates() looks for) that only reduces to one big complex group, never a clean pair.
      const hasEquityCapitalLine = g.lines.some((l) => profiles.get(l.accountId)?.category === 'equity_capital')
      out.push({
        group: g, treatment: hasEquityCapitalLine ? 'opening_balance' : 'unclassified_complex',
        matchedRule: hasEquityCapitalLine ? '0b-equity-capital-in-complex-group' : 'unbalanced_complex_group',
        confidence: hasEquityCapitalLine ? 'high' : 'low',
        amount: round2(g.lines.reduce((s, l) => s + (l.base1Debit ?? 0), 0)),
        jobId: g.lines.find((l) => l.jobId !== null)?.jobId ?? null, jobMappedProjectKey: null,
        narration: [...new Set(g.lines.map((l) => l.narration))].join(' | '),
        resolvedLines: g.lines.map(toResolvedLine),
      })
      continue
    }
    const [l1, l2] = g.lines
    const debitLine = l1.base1Debit !== null ? l1 : l2
    const creditLine = l1.base1Credit !== null ? l1 : l2
    const debitProfile = profiles.get(debitLine.accountId)
    const creditProfile = profiles.get(creditLine.accountId)
    const jobId = debitLine.jobId ?? creditLine.jobId
    const job = jobId !== null ? jobMapForBook.get(jobId) : undefined
    const jobMappedProjectKey = job?.mappedProject ?? null
    const narration = debitLine.narration || creditLine.narration

    const base: Omit<ClassifiedGroup, 'treatment' | 'matchedRule' | 'confidence'> = {
      group: g, amount: g.amount, jobId, jobMappedProjectKey, narration,
      resolvedLines: [toResolvedLine(debitLine), toResolvedLine(creditLine)],
    }

    // Rule 0: either leg is the Capital/equity account - MUST be opening_balance, since the live schema's
    // EQ-OPENING guard trigger rejects any line on that code whose journal entry_kind isn't 'opening_balance'.
    if (debitProfile?.category === 'equity_capital' || creditProfile?.category === 'equity_capital') {
      out.push({ ...base, treatment: 'opening_balance', matchedRule: '0-equity-capital-account', confidence: 'high' })
      continue
    }
    // Rule 1: opening balance (only if on the human-reviewed candidate list, never inferred from date alone)
    if (openingCandidateIds.has(g.id)) {
      out.push({ ...base, treatment: 'opening_balance', matchedRule: '1-opening-candidate', confidence: 'high' })
      continue
    }
    // Rule 2: payroll
    if (debitProfile?.category === 'salary' || creditProfile?.category === 'salary') {
      out.push({ ...base, treatment: 'payroll', matchedRule: '2-payroll', confidence: 'medium' })
      continue
    }
    // Rule 3: partner funding
    if (debitProfile?.category === 'partner' || creditProfile?.category === 'partner') {
      out.push({ ...base, treatment: 'partner_funding', matchedRule: '3-partner', confidence: 'high' })
      continue
    }
    // Rules 4-6: client-side treatment is driven by the BALANCE-BASED resolver (requirement 1), not narration
    // alone - narration only distinguishes "revenue recognition" (professional_fee_revenue) from a plain funds
    // movement once we already know, from the running balance, whether that movement is an advance/held-funds
    // liability or a genuine receivable.
    const clientLeg = debitProfile?.category === 'client' ? debitProfile : creditProfile?.category === 'client' ? creditProfile : null
    const clientLine = debitProfile?.category === 'client' ? debitLine : creditProfile?.category === 'client' ? creditLine : null
    const clientResolvedCode = clientLine ? clientTargets.get(clientLine.voucherEntryId)?.code ?? null : null
    if (clientLeg && clientLine) {
      const isFeeInvoice = FEE_INVOICE_NARRATION.test(narration) || debitProfile?.category === 'income_fees' || creditProfile?.category === 'income_fees'
      const isFundsMovement = CASH_IN_NARRATION.test(narration) || CASH_OUT_NARRATION.test(narration)
      if (clientResolvedCode === 'AST-RECV' && (isFeeInvoice || isFundsMovement)) {
        // Balance was negative before this line: a genuine receivable (invoice growing it further) or an
        // actual settlement/collection against it - never a prepaid advance.
        out.push({ ...base, treatment: isFeeInvoice ? 'professional_fee_revenue' : 'client_receivable_settlement', matchedRule: '4-receivable-or-settlement', confidence: 'high' })
        continue
      }
      if (clientResolvedCode === 'LIA-CLIENTFUNDS' && isFundsMovement && !isFeeInvoice) {
        out.push({ ...base, treatment: 'client_project_funds_held', matchedRule: '5-client-funds-mapped-job', confidence: 'high' })
        continue
      }
      if (isFeeInvoice) {
        // Drawing an existing advance down into recognized income (balance was >= 0 before this line).
        out.push({ ...base, treatment: 'professional_fee_revenue', matchedRule: '6-fee-invoice-drawdown', confidence: 'high' })
        continue
      }
      if (isFundsMovement) {
        out.push({ ...base, treatment: 'client_advance_unallocated', matchedRule: '7-client-advance-unmapped-job', confidence: clientLeg.confidence === 'low' ? 'low' : 'medium' })
        continue
      }
    }
    // Rule 8: supplier/contractor payable settling against a cost/opex account
    const payableLeg = debitProfile?.category === 'supplier_payable' || debitProfile?.category === 'payee_like'
      ? debitProfile : creditProfile?.category === 'supplier_payable' || creditProfile?.category === 'payee_like' ? creditProfile : null
    const costLeg = debitProfile?.category === 'cost' || debitProfile?.category === 'company_opex'
      ? debitProfile : creditProfile?.category === 'cost' || creditProfile?.category === 'company_opex' ? creditProfile : null
    if (payableLeg && (costLeg || debitProfile?.category === 'cash' || debitProfile?.category === 'bank' || creditProfile?.category === 'cash' || creditProfile?.category === 'bank')) {
      out.push({ ...base, treatment: 'supplier_payable_cost', matchedRule: '8-payable', confidence: payableLeg.confidence })
      continue
    }
    // Rule 9: plain cash/bank transfer
    const isCashOrBank = (p?: AccountProfile) => p?.category === 'cash' || p?.category === 'bank' || p?.category === 'petty_cash'
    if (isCashOrBank(debitProfile) && isCashOrBank(creditProfile)) {
      out.push({ ...base, treatment: 'cash_bank_transfer', matchedRule: '8-transfer', confidence: 'high' })
      continue
    }
    // Rule 10: everything else
    out.push({ ...base, treatment: 'needs_review', matchedRule: '10-unmatched', confidence: 'low' })
  }
  return out
}

export function findOpeningCandidates(groups: PairGroup[]): Set<string> {
  const ids = new Set<string>()
  for (const g of groups) {
    if (g.status !== 'clean_pair') continue
    const narr = g.lines[0].narration || g.lines[1].narration
    const jvType = g.lines[0].jvTypeId
    if (OPENING_NARRATION.test(narr) && (jvType === 28 || jvType === 42)) ids.add(g.id)
  }
  return ids
}

// ---------- voucher-level assembly (requirement 1: preserve every original balanced voucher) ----------
//
// The legacy JVID, not the pair, is the unit of ledger preservation: every line belonging to a JVID is
// always imported, in one historical journal entry per JVID, UNLESS that JVID demonstrably bundles a real
// opening-balance posting together with unrelated operating lines under the same legacy save action - proven
// to happen (NEXTUDIO JVID 7: a genuine "Starting of 2026" pair plus six unrelated backdated 2025 client
// receipts, all sharing one JVID). In that one specific situation, and ONLY then, the JVID's opening-tagged
// lines are split into their own opening_balance entry (still tagged with the original legacy_jvid for full
// traceability) so they satisfy the live schema's EQ-OPENING guard (which requires entry_kind =
// 'opening_balance' for every line on that code) WITHOUT wrongly opening-tagging the other six real
// transactions, and without ever letting the same physical line appear in both an opening and an operating
// entry (requirement 7). A JVID with no opening content, or one that is ENTIRELY opening content (the common
// case - e.g. "01/01/2026 Capital"), becomes exactly one entry, matching the original voucher 1:1.
export type HistoricalJournalEntry = {
  book: LegacyBookCode
  legacyJvId: number
  legacyJvNumber: number | null
  entryKind: 'standard' | 'opening_balance'
  date: string
  reference: string
  splitFromLegacyVoucher: boolean
  lines: ResolvedLine[]
  managementTags: { treatment: Treatment; matchedRule: string; confidence: string; voucherEntryIds: number[] }[]
}

export function assembleJournalEntries(book: LegacyBookCode, vouchers: Map<number, LegacyJournalVoucher>, classified: ClassifiedGroup[]): HistoricalJournalEntry[] {
  const byJv = new Map<number, ClassifiedGroup[]>()
  for (const c of classified) {
    if (!byJv.has(c.group.jvId)) byJv.set(c.group.jvId, [])
    byJv.get(c.group.jvId)!.push(c)
  }
  const entries: HistoricalJournalEntry[] = []
  for (const [jvId, cgroups] of byJv) {
    const voucher = vouchers.get(jvId)
    const openingGroups = cgroups.filter((c) => c.treatment === 'opening_balance')
    const otherGroups = cgroups.filter((c) => c.treatment !== 'opening_balance')
    const mkEntry = (kind: 'standard' | 'opening_balance', gs: ClassifiedGroup[], split: boolean): HistoricalJournalEntry => ({
      book, legacyJvId: jvId, legacyJvNumber: voucher?.jvNumber ?? null, entryKind: kind,
      date: (voucher?.jvDate ?? '').slice(0, 10), reference: `LEGACY-${book}-JV${jvId}${split ? (kind === 'opening_balance' ? '-OPEN' : '-OP') : ''}`,
      splitFromLegacyVoucher: split, lines: gs.flatMap((g) => g.resolvedLines),
      managementTags: gs.map((g) => ({ treatment: g.treatment, matchedRule: g.matchedRule, confidence: g.confidence, voucherEntryIds: g.resolvedLines.map((l) => l.voucherEntryId) })),
    })
    if (openingGroups.length === 0) {
      entries.push(mkEntry('standard', cgroups, false))
    } else if (otherGroups.length === 0) {
      entries.push(mkEntry('opening_balance', cgroups, false))
    } else {
      entries.push(mkEntry('opening_balance', openingGroups, true))
      entries.push(mkEntry('standard', otherGroups, true))
    }
  }
  return entries
}

export function entryBalance(entry: HistoricalJournalEntry): { debit: number; credit: number; diff: number } {
  const debit = round2(entry.lines.reduce((s, l) => s + (l.debit ?? 0), 0))
  const credit = round2(entry.lines.reduce((s, l) => s + (l.credit ?? 0), 0))
  return { debit, credit, diff: round2(debit - credit) }
}

export { round2 }
export {
  loadTables, loadAccounts, loadVouchers, loadLines, loadJobs, loadAccountsBalances,
  LIVE_ACCOUNTS, PROPOSED_NEW_ACCOUNTS, HISTORICAL_ACCOUNT_ROOTS, BOOK_TARGET, JOB_MAP, JV_TYPE_CODE,
}
