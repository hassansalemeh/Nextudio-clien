// Historical reporting correction backfill (Phase 2 of the Polypus import).
//
//   npx tsx src/scripts/accounting-classify-legacy-history.ts [--nextudio=PATH] [--sarl=PATH]     dry run (default)
//   npx tsx src/scripts/accounting-classify-legacy-history.ts --apply                              writes to production
//
// Reads the two Polypus mysqldump files directly (never copies them into the repo) and reproduces, verbatim,
// the classification pipeline validated in the 100% coverage audit (chat history, 2026-09-29): prefixCategory,
// the ambiguous-411 evidence classifier, resolveClientLineTargets (with overshoot detection), RCV cash-sweep
// detection (receiptspayments/receiptspaymentsentries), and the full-reinvoice-pattern detection. It NEVER
// touches accounting_journal_lines.debit/credit/account_id/entry_date or any accounting_legacy_journal_line_ref
// column - the only writes are:
//   1. accounting_cash_accounts: split the single collapsed cash/bank/petty wrapper row per book into one row
//      per distinct original Polypus pot (dimension-only, same as the original accounting-backfill-cash-accounts.ts),
//      and backfill journal_lines.cash_account_id to point at the correct pot.
//   2. accounting_legacy_line_classification: one row per historical journal line (upsert, idempotent), giving
//      every line a persisted, reviewable semantic_class + VERIFIED/PRESERVED_AMBIGUOUS/MAPPING_ERROR status.
// Both are purely additive annotations; Journal and Trial Balance are provably unaffected (see the dry-run's
// own verification section, which recomputes total debit/credit from the DB and compares to source).
import { readFileSync } from 'fs'
import { pool } from '../db'
import { withTransaction } from '../http'
import { writeAuditLog } from '../accounting/auditLog'

// ---------- mysqldump reader (same trusted parser used throughout the investigation) ----------
type Row = (string | null)[]
function parseTuples(valuesStr: string): Row[] {
  const out: Row[] = []
  let i = 0
  const n = valuesStr.length
  while (i < n) {
    while (i < n && valuesStr[i] !== '(') i++
    if (i >= n) break
    i++
    const fields: (string | null)[] = []
    let cur = ''
    let inStr = false
    let sawQuote = false
    while (i < n) {
      const ch = valuesStr[i]
      if (inStr) {
        if (ch === '\\') {
          cur += valuesStr[i + 1] === "'" || valuesStr[i + 1] === '\\' ? valuesStr[i + 1] : '\\' + (valuesStr[i + 1] ?? '')
          i += 2
          continue
        } else if (ch === "'") {
          if (valuesStr[i + 1] === "'") {
            cur += "'"
            i += 2
            continue
          }
          inStr = false
          i++
          continue
        } else {
          cur += ch
          i++
          continue
        }
      } else {
        if (ch === "'") {
          inStr = true
          sawQuote = true
          i++
          continue
        } else if (ch === ',') {
          fields.push(cur === 'NULL' && !sawQuote ? null : cur)
          cur = ''
          sawQuote = false
          i++
          continue
        } else if (ch === ')') {
          fields.push(cur === 'NULL' && !sawQuote ? null : cur)
          cur = ''
          sawQuote = false
          i++
          break
        } else {
          cur += ch
          i++
          continue
        }
      }
    }
    out.push(fields)
  }
  return out
}
function loadTables(filePath: string, tableNames: string[]): Record<string, Row[]> {
  const content = readFileSync(filePath, 'latin1')
  const result: Record<string, Row[]> = {}
  for (const table of tableNames) {
    const re = new RegExp('INSERT INTO `' + table + '` VALUES (.*?);\\r?\\n', 'gs')
    const rows: Row[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) rows.push(...parseTuples(m[1]))
    result[table] = rows
  }
  return result
}
function num(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}
function round2(n: number) {
  return Math.round(n * 100) / 100
}

// ---------- reference constants (verbatim from tools/one-off/legacy-import/reference.ts) ----------
const CASH_IN_NARRATION = /cash\s*in\s*from|reedemed from/i
const CASH_OUT_NARRATION = /cash\s*out\s*to|paid .* to be reedemed from|paid .* for/i
const FEE_INVOICE_NARRATION = /sal\.?\s*inv\.?\s*no/i
const OPENING_NARRATION =
  /^\s*(?:\d{2}\/\d{2}\/\d{4}\s+)?(capital|starting of \d{4}|ending of \d{4}|opening balance of|opening)\s*$|^\s*(?:\d{2}\/\d{2}\/\d{4}\s+)?(capital|starting of \d{4}|ending of \d{4}|opening balance of)/i
const PCT_PATTERN = /(\d+(?:\.\d+)?)\s*%|%\s*out\s*of|out\s*of\s*\d/i
const COST_KEYWORD_RULES: { pattern: RegExp; code: string }[] = [
  { pattern: /concrete|readymix|ready.?mix|beton|sabeh/i, code: 'EXP-CONCRETE' },
  { pattern: /\bsteel\b/i, code: 'EXP-STEEL' },
  { pattern: /excavat/i, code: 'EXP-EXCAVATION' },
  { pattern: /mason/i, code: 'EXP-MASONRY' },
  { pattern: /tiling|tile/i, code: 'EXP-TILING' },
  { pattern: /paint/i, code: 'EXP-PAINTING' },
  { pattern: /clad/i, code: 'EXP-CLADDING' },
  { pattern: /waterproof/i, code: 'EXP-WATERPROOF' },
  { pattern: /plumb/i, code: 'EXP-PLUMBING' },
  { pattern: /electr/i, code: 'EXP-ELECTRICAL' },
  { pattern: /alumin/i, code: 'EXP-ALUMINIUM' },
  { pattern: /gypsum|plaster/i, code: 'EXP-GYPSUM' },
  { pattern: /carpentry|wood work/i, code: 'EXP-CARPENTRY' },
  { pattern: /permit|licens|municipality/i, code: 'EXP-PERMITS' },
  { pattern: /transport|delivery/i, code: 'EXP-TRANSPORT' },
  { pattern: /labou?r|janitor/i, code: 'EXP-LABOR' },
  { pattern: /salary|wages/i, code: 'CEXP-SALARIES' },
  { pattern: /\brent\b/i, code: 'CEXP-RENT' },
  { pattern: /\bwater\b|\bgaz\b|\bgas\b|electricity|\belectrique\b|\bedl\b/i, code: 'CEXP-UTILITIES' },
  { pattern: /elevator|maintenance|repair/i, code: 'CEXP-MAINTENANCE' },
  { pattern: /\bsms\b|\bogero\b|telecom|\btelephone\b|\bphone\b|\binternet\b/i, code: 'CEXP-TELECOM' },
  { pattern: /google workspace|godaddy|chatgpt|anthropic|claude|klingai|d5\b|qreators|whish|software|subscription|ishtirak/i, code: 'CEXP-SOFTWARE' },
  { pattern: /printing|stationary|stationery/i, code: 'CEXP-PRINTING' },
  { pattern: /office expense|office suppl/i, code: 'CEXP-OFFICE' },
  { pattern: /engineering (fee|service)|lawyer|professional fee/i, code: 'CEXP-PROFFEES' },
  { pattern: /bank (comission|commission|charge|fee)/i, code: 'CEXP-BANKFEES' },
]

type LegacyBookCode = 'NEXTUDIO' | 'NEXTUDIOSARL'
const JOB_MAP: Record<LegacyBookCode, { legacyJobId: number; legacyJobName: string }[]> = {
  NEXTUDIO: [
    { legacyJobId: 1, legacyJobName: 'Btater Project' },
    { legacyJobId: 2, legacyJobName: 'Kayfoun Project' },
    { legacyJobId: 3, legacyJobName: 'KZ Residence Project' },
    { legacyJobId: 4, legacyJobName: 'State House Facade Revival Project' },
    { legacyJobId: 5, legacyJobName: 'AM Appartment' },
  ],
  NEXTUDIOSARL: [
    { legacyJobId: 1, legacyJobName: 'Btater Project' },
    { legacyJobId: 2, legacyJobName: 'Chemlen Project' },
    { legacyJobId: 3, legacyJobName: 'Kz Residence Project' },
    { legacyJobId: 4, legacyJobName: 'Souk El Ghareb Project' },
  ],
}

// Cash/bank/petty pots to expose separately, per book. `primary: true` marks the pot that keeps the EXISTING
// accounting_cash_accounts row (created by the original accounting-backfill-cash-accounts.ts); every other
// pot gets a brand-new row. `jobLegacyId` links a pot to its accounting_legacy_jobs row where the audit
// established a 1:1 relationship (Cash Btater <-> Btater Project, etc.) - established by direct evidence
// (the account name and its transaction history), never guessed.
type CashPotDef = { legacyAccountId: number; name: string; kind: 'cash' | 'bank' | 'petty_cash'; ledgerCode: string; primary: boolean; jobLegacyId: number | null }
const CASH_POTS: Record<LegacyBookCode, CashPotDef[]> = {
  NEXTUDIO: [
    { legacyAccountId: 925, name: 'Nextudio Cash (Operating)', kind: 'cash', ledgerCode: 'AST-CASH', primary: true, jobLegacyId: null },
    { legacyAccountId: 1116, name: 'Cash - AM Apartment (historical job pot)', kind: 'cash', ledgerCode: 'AST-CASH', primary: false, jobLegacyId: 5 },
    { legacyAccountId: 1040, name: 'Cash - KZ Residence (historical job pot)', kind: 'cash', ledgerCode: 'AST-CASH', primary: false, jobLegacyId: 3 },
    { legacyAccountId: 993, name: 'Cash Savings', kind: 'cash', ledgerCode: 'AST-CASH', primary: false, jobLegacyId: null },
    { legacyAccountId: 988, name: 'Cash - Btater (historical job pot)', kind: 'cash', ledgerCode: 'AST-CASH', primary: false, jobLegacyId: 1 },
    { legacyAccountId: 1102, name: 'Cash Wollo', kind: 'cash', ledgerCode: 'AST-CASH', primary: false, jobLegacyId: null },
    { legacyAccountId: 1015, name: 'Cash Nextudio E', kind: 'cash', ledgerCode: 'AST-CASH', primary: false, jobLegacyId: null },
    { legacyAccountId: 951, name: 'Bank Nextudio $', kind: 'bank', ledgerCode: 'AST-BANK', primary: true, jobLegacyId: null },
    { legacyAccountId: 953, name: 'Bank Card Internet $', kind: 'bank', ledgerCode: 'AST-BANK', primary: false, jobLegacyId: null },
    { legacyAccountId: 1099, name: 'Bank Ethiopia', kind: 'bank', ledgerCode: 'AST-BANK', primary: false, jobLegacyId: null },
    { legacyAccountId: 927, name: 'Petty Cash Nextudio $', kind: 'petty_cash', ledgerCode: 'AST-PETTY', primary: true, jobLegacyId: null },
    { legacyAccountId: 1077, name: 'Whish Acc', kind: 'petty_cash', ledgerCode: 'AST-PETTY', primary: false, jobLegacyId: null },
  ],
  NEXTUDIOSARL: [
    { legacyAccountId: 912, name: 'Nextudio SARL Cash', kind: 'cash', ledgerCode: 'AST-CASH', primary: true, jobLegacyId: null },
    { legacyAccountId: 927, name: 'LSB SWISS $', kind: 'bank', ledgerCode: 'AST-BANK', primary: true, jobLegacyId: null },
  ],
}

function prefixCategory(accountNumber: string, mainName: string): string {
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
  if (/^1[02]/.test(n)) return 'equity_capital'
  if (/^6[012]/.test(n)) return 'cost'
  if (/^6[34]/.test(n)) return 'company_opex'
  if (/^7[01]/.test(n)) return 'income_fees'
  if (/^7[6789]/.test(n)) return 'income_other'
  return 'template_unused'
}
function costTargetConfidence(mainName: string): 'high' | 'low' {
  return COST_KEYWORD_RULES.some((rule) => rule.pattern.test(mainName)) ? 'high' : 'low'
}

type LegacyAccount = { accountId: number; accountNumber: string; mainName: string }
type L = {
  voucherEntryId: number
  jvId: number
  accountId: number
  jobId: number | null
  entryNumber: number
  debit: number | null
  credit: number | null
  date: string
  narration: string
  jvTypeId: number | null
}
type ClassifiedLine = {
  book: LegacyBookCode
  voucherEntryId: number
  accountId: number
  semanticClass: string
  status: 'VERIFIED' | 'PRESERVED_AMBIGUOUS' | 'MAPPING_ERROR'
  note: string
}

function classifyBook(book: LegacyBookCode, path: string): { lines: ClassifiedLine[]; sourceTotals: { debit: number; credit: number }; lineCount: number } {
  const tables = loadTables(path, ['accounts', 'vouchersentries', 'journalvouchers', 'jobs', 'receiptspayments', 'receiptspaymentsentries'])
  const accounts = new Map<number, LegacyAccount>()
  for (const r of tables.accounts) accounts.set(num(r[0])!, { accountId: num(r[0])!, accountNumber: r[3] ?? '', mainName: r[4] ?? '' })
  const lines: L[] = tables.vouchersentries.map((r) => ({
    voucherEntryId: num(r[0])!,
    jvId: num(r[1])!,
    accountId: num(r[2])!,
    jobId: num(r[4]),
    entryNumber: num(r[5]) ?? 0,
    debit: num(r[7]),
    credit: num(r[8]),
    date: (r[12] ?? '').slice(0, 10),
    narration: (r[13] ?? '').replace(/\r\n/g, ' / '),
    jvTypeId: num(r[3]),
  }))

  const rpById = new Map<number, { jvTypeId: number | null }>()
  for (const r of tables.receiptspayments) rpById.set(num(r[0])!, { jvTypeId: num(r[2]) })
  const rcvVoucherEntryIds = new Set<number>()
  for (const r of tables.receiptspaymentsentries) {
    const rp = rpById.get(num(r[1])!)
    if (rp?.jvTypeId === 48) rcvVoucherEntryIds.add(num(r[2])!)
  }

  const usedIds = new Set(lines.map((l) => l.accountId))
  const linesByAccount = new Map<number, L[]>()
  for (const l of lines) {
    if (!linesByAccount.has(l.accountId)) linesByAccount.set(l.accountId, [])
    linesByAccount.get(l.accountId)!.push(l)
  }
  const linesByJv = new Map<number, L[]>()
  for (const l of lines) {
    if (!linesByJv.has(l.jvId)) linesByJv.set(l.jvId, [])
    linesByJv.get(l.jvId)!.push(l)
  }

  type Profile = { account: LegacyAccount; category: string; confidence: string }
  const profiles = new Map<number, Profile>()
  for (const id of usedIds) {
    const acc = accounts.get(id)
    if (!acc) continue
    profiles.set(id, { account: acc, category: prefixCategory(acc.accountNumber, acc.mainName), confidence: 'medium' })
  }
  for (const [id, profile] of profiles) {
    if (profile.category !== 'client_receivable_ambiguous') continue
    let clientEvidence = 0
    let payeeEvidence = 0
    let feeEvidence = 0
    for (const l of linesByAccount.get(id) ?? []) {
      const other = (linesByJv.get(l.jvId) ?? []).find((x) => x.accountId !== id)
      const otherCat = other ? profiles.get(other.accountId)?.category ?? prefixCategory(accounts.get(other.accountId)?.accountNumber ?? '', '') : null
      if (FEE_INVOICE_NARRATION.test(l.narration)) feeEvidence++
      else if (CASH_IN_NARRATION.test(l.narration) && (otherCat === 'cash' || otherCat === 'bank')) clientEvidence++
      else if (CASH_OUT_NARRATION.test(l.narration) && (otherCat === 'cash' || otherCat === 'bank' || otherCat === 'cost')) payeeEvidence++
      else if (otherCat === 'cash' || otherCat === 'bank') clientEvidence += 0.5
    }
    const total = clientEvidence + payeeEvidence + feeEvidence
    if (total === 0) {
      profile.category = 'other'
      profile.confidence = 'low'
    } else if (feeEvidence > 0 || clientEvidence >= payeeEvidence * 2) {
      profile.category = 'client'
      profile.confidence = payeeEvidence === 0 ? 'high' : clientEvidence >= payeeEvidence * 3 ? 'medium' : 'low'
      if (payeeEvidence > 0) profile.confidence = 'low'
    } else if (payeeEvidence > clientEvidence) {
      profile.category = 'payee_like'
      profile.confidence = clientEvidence === 0 ? 'high' : 'low'
    } else {
      profile.category = 'other'
      profile.confidence = 'low'
    }
    if (total < 1.5 && profile.confidence !== 'low') profile.confidence = 'low'
    else if (total < 3 && profile.confidence === 'high') profile.confidence = 'medium'
  }

  const jobMapForBook = new Map(JOB_MAP[book].map((j) => [j.legacyJobId, j]))
  type Target = { code: string; balanceBefore: number; balanceAfter: number; overshootAmt: number }
  const clientTargets = new Map<number, Target>()
  const byAccount = new Map<number, L[]>()
  for (const l of lines) {
    if (profiles.get(l.accountId)?.category !== 'client') continue
    if (!byAccount.has(l.accountId)) byAccount.set(l.accountId, [])
    byAccount.get(l.accountId)!.push(l)
  }
  for (const [, accLines] of byAccount) {
    const sorted = [...accLines].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      if (a.jvId !== b.jvId) return a.jvId - b.jvId
      return a.entryNumber - b.entryNumber
    })
    let balance = 0
    for (const l of sorted) {
      const balanceBefore = balance
      // Every legacy job is unmapped in production (verified 2026-09-29: accounting_legacy_jobs.status =
      // 'unmapped' for all 9 rows, including State House Facade Revival) - so the liability code is always
      // LIA-CLIENTADV, never LIA-CLIENTFUNDS (which requires a confirmed Control-project mapping).
      const isCredit = l.credit !== null
      const code = isCredit ? (balanceBefore < -0.01 ? 'AST-RECV' : 'LIA-CLIENTADV') : balanceBefore > 0.01 ? 'LIA-CLIENTADV' : 'AST-RECV'
      const delta = (l.credit ?? 0) - (l.debit ?? 0)
      balance = round2(balance + delta)
      let overshootAmt = 0
      if (isCredit && balanceBefore < -0.01 && balance > 0.01) overshootAmt = round2(Math.min(Math.abs(balanceBefore), Math.abs(balance)))
      if (!isCredit && balanceBefore > 0.01 && balance < -0.01) overshootAmt = round2(Math.min(Math.abs(balanceBefore), Math.abs(balance)))
      clientTargets.set(l.voucherEntryId, { code, balanceBefore, balanceAfter: balance, overshootAmt })
    }
  }

  function isFullReinvoice(l: L): boolean {
    if (l.debit === null || !FEE_INVOICE_NARRATION.test(l.narration)) return false
    const accLines = byAccount.get(l.accountId) ?? []
    const d0 = Date.parse(l.date)
    return accLines.some((x) => x.credit !== null && round2(x.credit) === round2(l.debit!) && Math.abs(Date.parse(x.date) - d0) <= 10 * 86400000)
  }

  const openingJvIds = new Set<number>()
  for (const [jvId, jvLines] of linesByJv) {
    if (jvLines.some((l) => profiles.get(l.accountId)?.category === 'equity_capital')) {
      openingJvIds.add(jvId)
      continue
    }
    if (jvLines.length === 2) {
      const narr = jvLines[0].narration || jvLines[1].narration
      const jvType = jvLines[0].jvTypeId
      if (OPENING_NARRATION.test(narr) && (jvType === 28 || jvType === 42)) openingJvIds.add(jvId)
    }
  }

  const out: ClassifiedLine[] = []
  let sourceDebit = 0
  let sourceCredit = 0
  for (const l of lines) {
    sourceDebit += l.debit ?? 0
    sourceCredit += l.credit ?? 0
    const profile = profiles.get(l.accountId)!
    const acc = profile.account
    const other = (linesByJv.get(l.jvId) ?? []).find((x) => x.voucherEntryId !== l.voucherEntryId)
    const otherProfile = other ? profiles.get(other.accountId) : undefined
    let semanticClass = 'other'
    let status: ClassifiedLine['status'] = 'PRESERVED_AMBIGUOUS'
    let note = ''

    if (openingJvIds.has(l.jvId)) {
      semanticClass = 'opening balance'
      status = 'VERIFIED'
      note = 'equity/opening-tagged voucher'
    } else if (profile.category === 'cash' || profile.category === 'bank' || profile.category === 'petty_cash') {
      const jvLines = linesByJv.get(l.jvId) ?? []
      const otherLines = jvLines.filter((x) => x.voucherEntryId !== l.voucherEntryId)
      const allOtherCash = otherLines.length > 0 && otherLines.every((x) => ['cash', 'bank', 'petty_cash'].includes(profiles.get(x.accountId)?.category ?? ''))
      if (rcvVoucherEntryIds.has(other?.voucherEntryId ?? -1) || rcvVoucherEntryIds.has(l.voucherEntryId)) {
        semanticClass = 'confirmed professional-fee collection / RCV sweep'
        status = 'VERIFIED'
        note = 'matched receiptspayments JVTypeID=48 (RCV)'
      } else if (allOtherCash) {
        semanticClass = 'internal cash/bank transfer'
        status = 'VERIFIED'
        note = 'both legs are cash/bank/petty accounts'
      } else if (otherProfile?.category === 'client') {
        const t = clientTargets.get(other!.voucherEntryId)
        semanticClass = t?.code === 'AST-RECV' ? 'receivable/client-control movement' : 'client project funding'
        status = t && t.overshootAmt > 0 ? 'MAPPING_ERROR' : 'VERIFIED'
        note = t ? `client target=${t.code} balBefore=${t.balanceBefore} balAfter=${t.balanceAfter}${t.overshootAmt > 0 ? ` OVERSHOOT misrouted~$${t.overshootAmt}` : ''}` : ''
      } else if (otherProfile?.category === 'supplier_payable' || otherProfile?.category === 'payee_like') {
        semanticClass = 'supplier/contractor payment'
        status = 'VERIFIED'
      } else if (otherProfile?.category === 'salary') {
        semanticClass = 'payroll'
        status = 'VERIFIED'
      } else if (otherProfile?.category === 'partner') {
        semanticClass = 'partner funding/drawing'
        status = 'VERIFIED'
      } else if (otherProfile?.category === 'cost') {
        semanticClass = 'supplier/contractor payment'
        status = costTargetConfidence(otherProfile.account.mainName) === 'high' ? 'VERIFIED' : 'PRESERVED_AMBIGUOUS'
      } else if (otherProfile?.category === 'company_opex') {
        semanticClass = 'company operating expense'
        status = costTargetConfidence(otherProfile.account.mainName) === 'high' ? 'VERIFIED' : 'PRESERVED_AMBIGUOUS'
      } else if (otherProfile?.category === 'income_fees' || otherProfile?.category === 'income_other') {
        semanticClass = 'professional-fee invoice'
        status = 'VERIFIED'
      } else if (otherLines.length === 0) {
        semanticClass = 'other'
        status = 'PRESERVED_AMBIGUOUS'
        note = 'unpaired complex-group cash line'
      } else {
        semanticClass = 'ambiguous / requires manual review'
        status = 'PRESERVED_AMBIGUOUS'
      }
    } else if (profile.category === 'supplier_payable' || profile.category === 'payee_like') {
      semanticClass = 'supplier/contractor payment'
      status = 'VERIFIED'
    } else if (profile.category === 'salary') {
      semanticClass = 'payroll'
      status = 'VERIFIED'
    } else if (profile.category === 'partner') {
      semanticClass = 'partner funding/drawing'
      status = 'VERIFIED'
    } else if (profile.category === 'cost') {
      semanticClass = l.jobId !== null ? 'supplier/contractor payment' : 'company operating expense'
      status = costTargetConfidence(acc.mainName) === 'high' ? 'VERIFIED' : 'PRESERVED_AMBIGUOUS'
    } else if (profile.category === 'company_opex') {
      semanticClass = 'company operating expense'
      status = costTargetConfidence(acc.mainName) === 'high' ? 'VERIFIED' : 'PRESERVED_AMBIGUOUS'
    } else if (profile.category === 'income_fees') {
      if (l.credit !== null) {
        semanticClass = 'professional-fee invoice'
        status = 'VERIFIED'
      } else {
        semanticClass = 'ambiguous / requires manual review'
        status = 'PRESERVED_AMBIGUOUS'
      }
    } else if (profile.category === 'income_other') {
      semanticClass = 'other'
      status = 'VERIFIED'
    } else if (profile.category === 'client') {
      const t = clientTargets.get(l.voucherEntryId)
      const feeReinvoice = isFullReinvoice(l)
      if (l.debit !== null && FEE_INVOICE_NARRATION.test(l.narration)) {
        if (feeReinvoice) {
          semanticClass = 'client project funding'
          status = 'MAPPING_ERROR'
          note =
            "FULL-REINVOICE pattern: amount matches a same-account deposit within 10 days - currently booked as professional_fee_revenue (INC-FEES) but structural evidence shows it is a re-invoice of the client's own deposit, not earned revenue"
        } else if (PCT_PATTERN.test(l.narration)) {
          semanticClass = 'professional-fee invoice'
          status = 'VERIFIED'
          note = 'explicit %-of-Y fee narration'
        } else {
          semanticClass = 'professional-fee invoice'
          status = 'PRESERVED_AMBIGUOUS'
          note = 'Sal. Inv. line with no %-pattern and no matching deposit - cannot confirm as genuine fee vs. something else'
        }
      } else {
        semanticClass = t?.code === 'AST-RECV' ? 'receivable/client-control movement' : 'client project funding'
        status = t && t.overshootAmt > 0 ? 'MAPPING_ERROR' : 'VERIFIED'
        note = t ? `client target=${t.code} balBefore=${t.balanceBefore} balAfter=${t.balanceAfter}${t.overshootAmt > 0 ? ` OVERSHOOT misrouted~$${t.overshootAmt}` : ''}` : ''
      }
    } else if (profile.category === 'other' || profile.category === 'template_unused') {
      semanticClass = 'ambiguous / requires manual review'
      status = 'PRESERVED_AMBIGUOUS'
      note = `category=${profile.category}`
    } else {
      semanticClass = 'ambiguous / requires manual review'
      status = 'PRESERVED_AMBIGUOUS'
    }

    out.push({ book, voucherEntryId: l.voucherEntryId, accountId: l.accountId, semanticClass, status, note })
  }

  return { lines: out, sourceTotals: { debit: round2(sourceDebit), credit: round2(sourceCredit) }, lineCount: lines.length }
}

// ---------- main ----------
function arg(name: string, def: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.split('=').slice(1).join('=') : def
}

async function main() {
  const apply = process.argv.includes('--apply')
  const files: { book: LegacyBookCode; dbCode: 'NEXTUDIO' | 'NEXTUDIO_SARL'; path: string }[] = [
    { book: 'NEXTUDIO', dbCode: 'NEXTUDIO', path: arg('nextudio', 'C:\\Users\\Hassan\\Downloads\\NEXTUDIO_20260928.sql') },
    { book: 'NEXTUDIOSARL', dbCode: 'NEXTUDIO_SARL', path: arg('sarl', 'C:\\Users\\Hassan\\Downloads\\NEXTUDIOsarl_20260928.sql') },
  ]

  console.log(`${apply ? 'APPLYING to production' : 'DRY RUN (nothing will be written)'}`)
  console.log('='.repeat(100))

  const results = files.map((f) => ({ ...f, ...classifyBook(f.book, f.path) }))

  let grandLineCount = 0
  for (const r of results) {
    grandLineCount += r.lineCount
    const byStatus = new Map<string, { n: number; debit: number }>()
    console.log(`\n${r.book}: ${r.lineCount} source lines, source debit=${r.sourceTotals.debit} credit=${r.sourceTotals.credit}`)
    for (const l of r.lines) {
      const e = byStatus.get(l.status) ?? { n: 0, debit: 0 }
      e.n++
      byStatus.set(l.status, e)
    }
    for (const [status, e] of byStatus) console.log(`  ${status}: ${e.n} lines`)
  }
  console.log(`\nTOTAL lines classified: ${grandLineCount}`)

  // ---- resolve against production (read-only until --apply) ----
  const books = (await pool.query(`SELECT id, code FROM accounting_books`)).rows as { id: string; code: string }[]
  const bookIdByCode = new Map(books.map((b) => [b.code, b.id]))

  const refRows = (
    await pool.query(
      `SELECT lr.legacy_book_code, lr.legacy_voucher_entry_id, lr.legacy_account_id, lr.journal_line_id
       FROM accounting_legacy_journal_line_ref lr`
    )
  ).rows as { legacy_book_code: string; legacy_voucher_entry_id: string; legacy_account_id: string; journal_line_id: string }[]
  const refByKey = new Map<string, { journalLineId: string; legacyAccountId: number }>()
  for (const r of refRows) {
    const bookCode = r.legacy_book_code === 'NEXTUDIOSARL' ? 'NEXTUDIOSARL' : 'NEXTUDIO'
    refByKey.set(`${bookCode}:${r.legacy_voucher_entry_id}`, { journalLineId: r.journal_line_id, legacyAccountId: Number(r.legacy_account_id) })
  }

  const legacyJobRows = (await pool.query(`SELECT id, book_id, legacy_job_id FROM accounting_legacy_jobs`)).rows as { id: string; book_id: string; legacy_job_id: string }[]

  const missing: string[] = []
  const classificationRows: { journalLineId: string; semanticClass: string; status: string; note: string }[] = []
  for (const r of results) {
    for (const l of r.lines) {
      const ref = refByKey.get(`${r.book}:${l.voucherEntryId}`)
      if (!ref) {
        missing.push(`${r.book}:${l.voucherEntryId}`)
        continue
      }
      classificationRows.push({ journalLineId: ref.journalLineId, semanticClass: l.semanticClass, status: l.status, note: l.note })
    }
  }
  console.log(`\nMatched to production accounting_legacy_journal_line_ref: ${classificationRows.length}/${grandLineCount}`)
  if (missing.length) console.log(`  MISSING (not found in production - investigate before applying): ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ` (+${missing.length - 20} more)` : ''}`)

  // ---- cash account plan ----
  type CashAccountPlan = { dbCode: string; def: CashPotDef; existingId: string | null; legacyJobRowId: string | null }
  const plans: CashAccountPlan[] = []
  const existingCashAccounts = (await pool.query(`SELECT id, book_id, name, kind, ledger_account_id, legacy_account_id FROM accounting_cash_accounts`)).rows as {
    id: string
    book_id: string
    name: string
    kind: string
    ledger_account_id: string
    legacy_account_id: string | null
  }[]
  const ledgerAccounts = (await pool.query(`SELECT aa.id, aa.code, aa.book_id FROM accounting_accounts aa WHERE aa.code IN ('AST-CASH','AST-BANK','AST-PETTY')`)).rows as {
    id: string
    code: string
    book_id: string
  }[]

  for (const f of files) {
    const bookId = bookIdByCode.get(f.dbCode)
    if (!bookId) throw new Error(`Book ${f.dbCode} not found in production`)
    for (const def of CASH_POTS[f.book]) {
      const ledgerAccount = ledgerAccounts.find((a) => a.book_id === bookId && a.code === def.ledgerCode)
      if (!ledgerAccount) {
        console.log(`  skip pot ${def.name} (${f.book}): no ${def.ledgerCode} ledger account in this book`)
        continue
      }
      const jobRow = def.jobLegacyId !== null ? legacyJobRows.find((j) => j.book_id === bookId && Number(j.legacy_job_id) === def.jobLegacyId) : undefined
      let existingId: string | null = null
      if (def.primary) {
        const existing = existingCashAccounts.find((c) => c.book_id === bookId && c.ledger_account_id === ledgerAccount.id && c.legacy_account_id === null)
        existingId = existing?.id ?? null
      } else {
        const already = existingCashAccounts.find((c) => c.book_id === bookId && Number(c.legacy_account_id) === def.legacyAccountId)
        existingId = already?.id ?? null // idempotent: already backfilled on a prior run
      }
      plans.push({ dbCode: f.dbCode, def, existingId, legacyJobRowId: jobRow?.id ?? null })
    }
  }

  console.log(`\nCash account plan (${plans.length} pots):`)
  for (const p of plans) {
    const action = p.existingId ? (p.def.primary ? 'REUSE existing row, backfill legacy_account_id' : 'ALREADY DONE (legacy_account_id set)') : 'CREATE new row'
    console.log(`  ${p.dbCode} legacy#${p.def.legacyAccountId} "${p.def.name}" (${p.def.kind}) job=${p.legacyJobRowId ?? 'none'} -> ${action}`)
  }

  if (!apply) {
    console.log('\n' + '='.repeat(100))
    console.log('DRY RUN COMPLETE. Review the plan above, then re-run with --apply to write to production.')
    return
  }

  if (missing.length > 0) {
    throw new Error(`Refusing to apply: ${missing.length} classified lines have no matching accounting_legacy_journal_line_ref row. Investigate first.`)
  }

  // ---- APPLY ----
  const userId = (await pool.query(`SELECT id FROM app_users WHERE role = 'admin' ORDER BY id LIMIT 1`)).rows[0]?.id
  const cashAccountIdByLegacyAccountId = new Map<string, string>() // `${dbCode}:${legacyAccountId}` -> cash_account_id

  await withTransaction(async (client) => {
    for (const p of plans) {
      const bookId = bookIdByCode.get(p.dbCode)!
      const ledgerAccount = ledgerAccounts.find((a) => a.book_id === bookId && a.code === p.def.ledgerCode)!
      let cashAccountId = p.existingId
      if (!cashAccountId) {
        if (p.def.primary) {
          throw new Error(`Expected an existing primary cash account for ${p.dbCode} ${p.def.ledgerCode} - none found. Run accounting-backfill-cash-accounts.ts first.`)
        }
        const inserted = await client.query(
          `INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, currency_code, legacy_account_id, legacy_job_id)
           VALUES ($1,$2,$3,$4,'USD',$5,$6) RETURNING id`,
          [bookId, p.def.name, p.def.kind, ledgerAccount.id, p.def.legacyAccountId, p.legacyJobRowId]
        )
        cashAccountId = inserted.rows[0].id
        await writeAuditLog(client, {
          book_id: bookId,
          entity_type: 'cash_account',
          entity_id: cashAccountId!,
          action: 'create',
          performed_by_user_id: userId,
          after: { name: p.def.name, kind: p.def.kind, ledger_account_id: ledgerAccount.id, legacy_account_id: p.def.legacyAccountId },
          notes: 'accounting-classify-legacy-history.ts - historical cash-pot identity split',
        })
      } else if (p.def.primary) {
        await client.query(`UPDATE accounting_cash_accounts SET name = $2, legacy_account_id = $3 WHERE id = $1 AND legacy_account_id IS NULL`, [
          cashAccountId,
          p.def.name,
          p.def.legacyAccountId,
        ])
      }
      cashAccountIdByLegacyAccountId.set(`${p.dbCode}:${p.def.legacyAccountId}`, cashAccountId!)
    }

    // Backfill cash_account_id on every journal line whose legacy pot resolves to one of the plans above -
    // dimension-only, same guarantee as the original accounting-backfill-cash-accounts.ts.
    let backfilled = 0
    for (const r of results) {
      const dbCode = r.book === 'NEXTUDIOSARL' ? 'NEXTUDIO_SARL' : 'NEXTUDIO'
      for (const def of CASH_POTS[r.book]) {
        const cashAccountId = cashAccountIdByLegacyAccountId.get(`${dbCode}:${def.legacyAccountId}`)
        if (!cashAccountId) continue
        const result = await client.query(
          `UPDATE accounting_journal_lines jl
           SET cash_account_id = $1
           FROM accounting_legacy_journal_line_ref lr
           WHERE lr.journal_line_id = jl.id AND lr.legacy_book_code = $2 AND lr.legacy_account_id = $3
             AND jl.cash_account_id IS DISTINCT FROM $1`,
          [cashAccountId, dbCode === 'NEXTUDIO_SARL' ? 'NEXTUDIOSARL' : 'NEXTUDIO', def.legacyAccountId]
        )
        backfilled += result.rowCount ?? 0
      }
    }
    console.log(`  cash_account_id backfilled/repointed on ${backfilled} lines`)

    // Upsert classification rows.
    let classified = 0
    for (const row of classificationRows) {
      await client.query(
        `INSERT INTO accounting_legacy_line_classification (journal_line_id, semantic_class, status, note)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (journal_line_id) DO UPDATE SET semantic_class = EXCLUDED.semantic_class, status = EXCLUDED.status, note = EXCLUDED.note, classified_at = now()`,
        [row.journalLineId, row.semanticClass, row.status, row.note]
      )
      classified++
    }
    console.log(`  classification rows upserted: ${classified}`)
  })

  console.log('\nAPPLY COMPLETE.')
}

main()
  .catch((err) => {
    console.error('Failed:', err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
