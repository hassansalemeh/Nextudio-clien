// Point-in-time snapshot of the live (production) Phase 1B accounting schema, captured read-only on
// 2026-09-28 via a rolled-back SELECT - see the chat history for the query. This file is deliberately NOT a
// live DB call: the whole dry-run pipeline must run with zero production access. Re-capture this snapshot
// (same read-only query) immediately before the real import, since Setup may have changed accounts/projects
// by then.

export const BOOKS = {
  NEXTUDIO: { id: 1, code: 'NEXTUDIO' as const },
  NEXTUDIO_SARL: { id: 2, code: 'NEXTUDIO_SARL' as const },
}

export type LegacyBookCode = 'NEXTUDIO' | 'NEXTUDIOSARL'
export const BOOK_TARGET: Record<LegacyBookCode, keyof typeof BOOKS> = {
  NEXTUDIO: 'NEXTUDIO',
  NEXTUDIOSARL: 'NEXTUDIO_SARL',
}

// code -> live accounting_accounts row, per book. Re-captured read-only from production on 2026-09-28
// AFTER applying migrations 20261019000000/20261020000000 and the seed-chart additions (LIA-CLIENTADV,
// CEXP-UTILITIES/TELECOM/MAINTENANCE, SARL's project-cost set, and all HIST-* accounts) - every code this
// import needs is now live; PROPOSED_NEW_ACCOUNTS below is intentionally empty.
export const LIVE_ACCOUNTS: Record<string, { id: number; bookId: number; type: string }> = {
  'NEXTUDIO:AST-CASH': { id: 11, bookId: 1, type: 'asset' },
  'NEXTUDIO:AST-BANK': { id: 12, bookId: 1, type: 'asset' },
  'NEXTUDIO:AST-PETTY': { id: 13, bookId: 1, type: 'asset' },
  'NEXTUDIO:AST-PROJFUND': { id: 14, bookId: 1, type: 'asset' },
  'NEXTUDIO:AST-RECV': { id: 15, bookId: 1, type: 'asset' },
  'NEXTUDIO:AST-REIMB': { id: 16, bookId: 1, type: 'asset' },
  'NEXTUDIO:LIA-CLIENTFUNDS': { id: 17, bookId: 1, type: 'liability' },
  'NEXTUDIO:LIA-PAYABLES': { id: 18, bookId: 1, type: 'liability' },
  'NEXTUDIO:LIA-PARTNER': { id: 19, bookId: 1, type: 'liability' },
  'NEXTUDIO:EQ-OPENING': { id: 20, bookId: 1, type: 'equity' },
  'NEXTUDIO:INC-FEES': { id: 21, bookId: 1, type: 'income' },
  'NEXTUDIO:INC-OTHER': { id: 22, bookId: 1, type: 'income' },
  'NEXTUDIO:EXP-CONCRETE': { id: 23, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-STEEL': { id: 24, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-LABOR': { id: 25, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-EXCAVATION': { id: 26, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-MASONRY': { id: 27, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-TILING': { id: 28, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-PAINTING': { id: 29, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-CLADDING': { id: 30, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-WATERPROOF': { id: 31, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-PLUMBING': { id: 32, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-ELECTRICAL': { id: 33, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-ALUMINIUM': { id: 34, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-GYPSUM': { id: 35, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-CARPENTRY': { id: 36, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-PERMITS': { id: 37, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-TRANSPORT': { id: 38, bookId: 1, type: 'expense' },
  'NEXTUDIO:EXP-OTHERPROJECT': { id: 39, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-SALARIES': { id: 40, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-RENT': { id: 41, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-SOFTWARE': { id: 42, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-PRINTING': { id: 43, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-OFFICE': { id: 44, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-PROFFEES': { id: 45, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-BANKFEES': { id: 46, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-OTHEROPEX': { id: 47, bookId: 1, type: 'expense' },
  'NEXTUDIO:LIA-CLIENTADV': { id: 59, bookId: 1, type: 'liability' },
  'NEXTUDIO:CEXP-UTILITIES': { id: 60, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-TELECOM': { id: 61, bookId: 1, type: 'expense' },
  'NEXTUDIO:CEXP-MAINTENANCE': { id: 62, bookId: 1, type: 'expense' },
  'NEXTUDIO:HIST-EXP-ROOT': { id: 63, bookId: 1, type: 'expense' },
  'NEXTUDIO:HIST-AST-ROOT': { id: 64, bookId: 1, type: 'asset' },
  'NEXTUDIO:HIST-LIA-ROOT': { id: 65, bookId: 1, type: 'liability' },
  'NEXTUDIO:HIST-68511001': { id: 66, bookId: 1, type: 'expense' },
  'NEXTUDIO:HIST-46190001': { id: 67, bookId: 1, type: 'asset' },
  'NEXTUDIO_SARL:AST-CASH': { id: 48, bookId: 2, type: 'asset' },
  'NEXTUDIO_SARL:AST-BANK': { id: 49, bookId: 2, type: 'asset' },
  'NEXTUDIO_SARL:AST-RECV': { id: 50, bookId: 2, type: 'asset' },
  'NEXTUDIO_SARL:LIA-CLIENTFUNDS': { id: 51, bookId: 2, type: 'liability' },
  'NEXTUDIO_SARL:LIA-PAYABLES': { id: 52, bookId: 2, type: 'liability' },
  'NEXTUDIO_SARL:LIA-PARTNER': { id: 53, bookId: 2, type: 'liability' },
  'NEXTUDIO_SARL:EQ-OPENING': { id: 54, bookId: 2, type: 'equity' },
  'NEXTUDIO_SARL:INC-FEES': { id: 55, bookId: 2, type: 'income' },
  'NEXTUDIO_SARL:INC-OTHER': { id: 56, bookId: 2, type: 'income' },
  'NEXTUDIO_SARL:CEXP-BANKFEES': { id: 57, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-OTHEROPEX': { id: 58, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:LIA-CLIENTADV': { id: 68, bookId: 2, type: 'liability' },
  'NEXTUDIO_SARL:EXP-CONCRETE': { id: 69, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-STEEL': { id: 70, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-LABOR': { id: 71, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-EXCAVATION': { id: 72, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-MASONRY': { id: 73, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-TILING': { id: 74, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-PAINTING': { id: 75, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-CLADDING': { id: 76, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-WATERPROOF': { id: 77, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-PLUMBING': { id: 78, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-ELECTRICAL': { id: 79, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-ALUMINIUM': { id: 80, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-GYPSUM': { id: 81, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-PERMITS': { id: 82, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-TRANSPORT': { id: 83, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:EXP-OTHERPROJECT': { id: 84, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-SALARIES': { id: 85, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-RENT': { id: 86, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-SOFTWARE': { id: 87, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-PRINTING': { id: 88, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-OFFICE': { id: 89, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-PROFFEES': { id: 90, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-UTILITIES': { id: 91, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-TELECOM': { id: 92, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:CEXP-MAINTENANCE': { id: 93, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:HIST-EXP-ROOT': { id: 94, bookId: 2, type: 'expense' },
  'NEXTUDIO_SARL:HIST-AST-ROOT': { id: 95, bookId: 2, type: 'asset' },
  'NEXTUDIO_SARL:HIST-LIA-ROOT': { id: 96, bookId: 2, type: 'liability' },
  'NEXTUDIO_SARL:HIST-44261001': { id: 97, bookId: 2, type: 'asset' },
  'NEXTUDIO_SARL:HIST-44261002': { id: 98, bookId: 2, type: 'asset' },
  'NEXTUDIO_SARL:HIST-332': { id: 99, bookId: 2, type: 'asset' },
  'NEXTUDIO_SARL:HIST-44252': { id: 100, bookId: 2, type: 'asset' },
}

// Every code this import needed has now been created in production (accounting-seed-chart.ts --apply,
// 2026-09-28: 9 accounts for NEXTUDIO, 33 for NEXTUDIO_SARL) and is listed in LIVE_ACCOUNTS above.
// Intentionally empty - kept as a type-compatible export so resolveCode()'s "still proposed" branch in
// run.ts remains reachable code (harmless) without needing a signature change this late in the process.
export const PROPOSED_NEW_ACCOUNTS: { book: LegacyBookCode; code: string; name: string; type: string; parent?: string }[] = []

// Requirement 3: statutory/balance-sheet items the source ledger genuinely uses (VAT, Works In Progress) get
// NO asserted Lebanese tax treatment - each becomes its own named child of HISTORICAL_ACCOUNT_ROOTS below,
// individually reviewable, never merged with an unrelated account or guessed into a real operating category.

// Per-book, per-type grouping ("parent") accounts that hold every legacy account this import could not
// confidently classify into a real operating/balance-sheet category (requirement 2/3: "preserve the original
// Polypus account as a clearly labelled historical sub-account" rather than dumping it into Other Operating
// Expenses, and requirement 1: never drop a line for lack of a confident category). Each ambiguous legacy
// account gets its OWN child account under the matching root (named "Legacy: <original name>"), never merged
// with another account, so it stays individually reviewable and reclassifiable without re-importing.
export const HISTORICAL_ACCOUNT_ROOTS: { book: LegacyBookCode; code: string; name: string; type: string }[] = [
  { book: 'NEXTUDIO', code: 'HIST-EXP-ROOT', name: 'Legacy Unclassified Expenses (review required)', type: 'expense' },
  { book: 'NEXTUDIO', code: 'HIST-AST-ROOT', name: 'Legacy Unclassified Assets (review required)', type: 'asset' },
  { book: 'NEXTUDIO', code: 'HIST-LIA-ROOT', name: 'Legacy Unclassified Counterparties/Liabilities (review required)', type: 'liability' },
  { book: 'NEXTUDIOSARL', code: 'HIST-EXP-ROOT', name: 'Legacy Unclassified Expenses (review required)', type: 'expense' },
  { book: 'NEXTUDIOSARL', code: 'HIST-AST-ROOT', name: 'Legacy Unclassified Assets (review required)', type: 'asset' },
  { book: 'NEXTUDIOSARL', code: 'HIST-LIA-ROOT', name: 'Legacy Unclassified Counterparties/Liabilities (review required)', type: 'liability' },
]

// Confirmed Control projects (read-only snapshot) relevant to job mapping.
export const CONTROL_PROJECTS = {
  DNT: { id: 9, clientId: 2, clientName: 'Design & Build Construction Limited' },
  SBM: { id: 10, clientId: 3, clientName: 'JMP' },
  ATR: { id: 11, clientId: 4, clientName: 'ATR Client - To Confirm' },
}

// Confirmed Control employees (read-only snapshot).
export const CONTROL_EMPLOYEES = [
  { id: 1, name: 'ghida' },
  { id: 3, name: 'Fatima' },
  { id: 4, name: 'Reem' },
]

export const CONTROL_CLIENTS = [
  { id: 1, name: 'Htech' },
  { id: 2, name: 'Design & Build Construction Limited' },
  { id: 3, name: 'JMP' },
  { id: 4, name: 'ATR Client - To Confirm' },
  { id: 7, name: 'Mr.Mohammad Karaki' },
  { id: 8, name: 'Mr.Ali Komaiha' },
  { id: 9, name: 'Mr.Mahmoud Mansour' },
  { id: 10, name: 'Mr.Wissam Abou Jnoudy' },
  { id: 16, name: 'Mrs.Hiba Bitar' },
]

// Legacy jobs (from `jobs` in each company dump) with their mapping decision. Only one confirmed mapping
// exists today; every other legacy job stays a historical-only accounting_legacy_jobs row (requirement 2 /
// design rule 2) - never a real Control project, even though some are financially very active.
export const JOB_MAP: { book: LegacyBookCode; legacyJobId: number; legacyJobCode: string; legacyJobName: string; mappedProject: keyof typeof CONTROL_PROJECTS | null }[] = [
  { book: 'NEXTUDIO', legacyJobId: 1, legacyJobCode: '001', legacyJobName: 'Btater Project', mappedProject: null },
  { book: 'NEXTUDIO', legacyJobId: 2, legacyJobCode: '002', legacyJobName: 'Kayfoun Project', mappedProject: null },
  { book: 'NEXTUDIO', legacyJobId: 3, legacyJobCode: '003', legacyJobName: 'KZ Residence Project', mappedProject: null },
  { book: 'NEXTUDIO', legacyJobId: 4, legacyJobCode: '004', legacyJobName: 'State House Facade Revival Project', mappedProject: 'DNT' },
  { book: 'NEXTUDIO', legacyJobId: 5, legacyJobCode: '005', legacyJobName: 'AM Appartment', mappedProject: null },
  { book: 'NEXTUDIOSARL', legacyJobId: 1, legacyJobCode: '001', legacyJobName: 'Btater Project', mappedProject: null },
  { book: 'NEXTUDIOSARL', legacyJobId: 2, legacyJobCode: '002', legacyJobName: 'Chemlen Project', mappedProject: null },
  { book: 'NEXTUDIOSARL', legacyJobId: 3, legacyJobCode: '003', legacyJobName: 'Kz Residence Project', mappedProject: null },
  { book: 'NEXTUDIOSARL', legacyJobId: 4, legacyJobCode: '004', legacyJobName: 'Souk El Ghareb Project', mappedProject: null },
]

// journalvoucherstypes.JVTypeID -> stable code, for the ~10 codes actually used in these two books.
export const JV_TYPE_CODE: Record<number, string> = {
  1: 'ASI', 6: 'CLS', 28: 'GJV', 29: 'INV', 30: 'IVC', 42: 'OPN', 43: 'PIV', 46: 'PYV', 48: 'RCV', 49: 'SAL', 51: 'SIV',
}

// Cost/expense keyword -> target EXP-*/CEXP-* code, tried in order (first match wins). Anything unmatched
// falls back to EXP-OTHERPROJECT (job present) or CEXP-OTHEROPEX (no job) with a low-confidence flag.
export const COST_KEYWORD_RULES: { pattern: RegExp; code: string }[] = [
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
  // Company-level opex keywords (no job context expected, but checked regardless). Ordered most-specific
  // first so e.g. "Bank Comissions" hits CEXP-BANKFEES before any looser "commission" match elsewhere.
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

// Narration patterns that indicate a funds-movement voucher (used by the classifier to distinguish a cash
// receipt/disbursement from a professional-fee invoice or a plain payable settlement).
export const CASH_IN_NARRATION = /cash\s*in\s*from|reedemed from/i
export const CASH_OUT_NARRATION = /cash\s*out\s*to|paid .* to be reedemed from|paid .* for/i
export const FEE_INVOICE_NARRATION = /sal\.?\s*inv\.?\s*no/i

// Opening-balance detection: matched at the PAIR-GROUP level, never by date alone (JVID 7 in NEXTUDIO proves
// a single voucher can mix a genuine opening line with unrelated backdated operating lines - see chat).
export const OPENING_NARRATION = /^\s*(?:\d{2}\/\d{2}\/\d{4}\s+)?(capital|starting of \d{4}|ending of \d{4}|opening balance of|opening)\s*$|^\s*(?:\d{2}\/\d{2}\/\d{4}\s+)?(capital|starting of \d{4}|ending of \d{4}|opening balance of)/i
