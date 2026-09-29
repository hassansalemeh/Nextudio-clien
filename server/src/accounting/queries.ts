import type { PoolClient } from 'pg'
import { roundMoney } from '../http'
import { EXCLUDE_REVERSAL_PAIRS_SQL } from './helpers'

type DbClient = Pick<PoolClient, 'query'>

// The derived balance of one cash/bank account: sum of debit - credit over its posted journal lines.
// There is no stored "current balance" column anywhere - this is always computed fresh.
export async function cashAccountBalance(db: DbClient, cashAccountId: string): Promise<number> {
  const result = await db.query(
    `SELECT coalesce(sum(jl.debit) - sum(jl.credit), 0) AS balance
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.cash_account_id = $1 AND je.status = 'posted'`,
    [cashAccountId]
  )
  return roundMoney(Number(result.rows[0].balance))
}

// The balance of any chart-of-accounts account, signed so a healthy balance is positive
// regardless of whether the account's normal side is debit (asset/expense) or credit (liability/equity/income).
export async function accountBalance(db: DbClient, accountId: string): Promise<number> {
  const result = await db.query(
    `SELECT coalesce(sum(jl.debit) FILTER (WHERE je.status = 'posted'), 0) AS total_debit,
            coalesce(sum(jl.credit) FILTER (WHERE je.status = 'posted'), 0) AS total_credit, aa.normal_balance
     FROM accounting_accounts aa
     LEFT JOIN accounting_journal_lines jl ON jl.account_id = aa.id
     LEFT JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
     WHERE aa.id = $1
     GROUP BY aa.normal_balance`,
    [accountId]
  )
  if (result.rows.length === 0) return 0
  const { total_debit, total_credit, normal_balance } = result.rows[0]
  const net = Number(total_debit) - Number(total_credit)
  return roundMoney(normal_balance === 'debit' ? net : -net) || 0
}

export type TrialBalanceRow = {
  account_id: string
  code: string | null
  name: string
  type: string
  parent_id: string | null
  parent_name: string | null
  total_debit: number
  total_credit: number
  balance: number
}

// parent_id/parent_name (e.g. every DNT/SBM/Kayfoun-style project fund ledger account filed under the
// "Project Funds / Project Cash" grouping account) let the Reports page show related accounts together,
// without ever posting to the parent itself - see accounting_accounts.parent_id's migration comment.
export async function trialBalance(db: DbClient, bookId: string): Promise<TrialBalanceRow[]> {
  const result = await db.query(
    `SELECT aa.id AS account_id, aa.code, aa.name, aa.type, aa.normal_balance, aa.parent_id, parent.name AS parent_name,
            coalesce(sum(jl.debit) FILTER (WHERE je.status = 'posted'), 0) AS total_debit,
            coalesce(sum(jl.credit) FILTER (WHERE je.status = 'posted'), 0) AS total_credit
     FROM accounting_accounts aa
     LEFT JOIN accounting_accounts parent ON parent.id = aa.parent_id
     LEFT JOIN accounting_journal_lines jl ON jl.account_id = aa.id
     LEFT JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
     WHERE aa.book_id = $1
     GROUP BY aa.id, aa.code, aa.name, aa.type, aa.normal_balance, aa.parent_id, parent.name
     ORDER BY aa.type, coalesce(parent.name, aa.name), aa.parent_id NULLS FIRST, aa.name`,
    [bookId]
  )
  return result.rows.map((row) => {
    const totalDebit = roundMoney(Number(row.total_debit))
    const totalCredit = roundMoney(Number(row.total_credit))
    const net = totalDebit - totalCredit
    return {
      account_id: row.account_id,
      code: row.code,
      name: row.name,
      type: row.type,
      parent_id: row.parent_id,
      parent_name: row.parent_name,
      total_debit: totalDebit,
      total_credit: totalCredit,
      balance: roundMoney(row.normal_balance === 'debit' ? net : -net),
    }
  })
}

// Money paid/received for a project, straight from the human-facing transactions (not the ledger lines) -
// the same source the Dashboard uses. Excludes transfers (never money in/out - direction is never
// 'transfer' here) and fully reversed pairs (EXCLUDE_REVERSAL_PAIRS_SQL): a reversal corrects a mistake, it
// is not a second genuine cash event, so a fully reversed transaction and the reversal that corrected it both
// contribute zero here - even though both remain visible, in full, in Journal and every history/statement view.
export async function projectTotals(db: DbClient, projectId: string, bookId: string): Promise<{ received: number; paid: number }> {
  const result = await db.query(
    `SELECT coalesce(sum(amount) FILTER (WHERE direction = 'money_in'), 0) AS received,
            coalesce(sum(amount) FILTER (WHERE direction = 'money_out'), 0) AS paid
     FROM accounting_transactions t
     WHERE t.project_id = $1 AND t.book_id = $2 AND t.status = 'posted' AND ${EXCLUDE_REVERSAL_PAIRS_SQL}`,
    [projectId, bookId]
  )
  const row = result.rows[0]
  return { received: roundMoney(Number(row.received)), paid: roundMoney(Number(row.paid)) }
}

export async function payeeTotals(db: DbClient, counterpartyId: string): Promise<{ paid: number; received: number }> {
  const result = await db.query(
    `SELECT coalesce(sum(amount) FILTER (WHERE direction = 'money_out'), 0) AS paid,
            coalesce(sum(amount) FILTER (WHERE direction = 'money_in'), 0) AS received
     FROM accounting_transactions t
     WHERE t.counterparty_id = $1 AND t.status = 'posted' AND ${EXCLUDE_REVERSAL_PAIRS_SQL}`,
    [counterpartyId]
  )
  const row = result.rows[0]
  return { paid: roundMoney(Number(row.paid)), received: roundMoney(Number(row.received)) }
}

// A payee's totals broken down per project (e.g. "DNT: $2,300 · Kayfoun: $2,450"), paid side only
// (the common case - a payee being paid across multiple projects). Same reversal-pair exclusion as above.
export async function payeeTotalsByProject(db: DbClient, counterpartyId: string) {
  const result = await db.query(
    `SELECT projects.id AS project_id, projects.name AS project_name,
            coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_out'), 0) AS paid,
            coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_in'), 0) AS received
     FROM accounting_transactions t
     JOIN projects ON projects.id = t.project_id
     WHERE t.counterparty_id = $1 AND t.status = 'posted' AND t.project_id IS NOT NULL AND ${EXCLUDE_REVERSAL_PAIRS_SQL}
     GROUP BY projects.id, projects.name
     HAVING sum(t.amount) FILTER (WHERE t.direction = 'money_out') > 0 OR sum(t.amount) FILTER (WHERE t.direction = 'money_in') > 0
     ORDER BY paid DESC`,
    [counterpartyId]
  )
  return result.rows.map((row) => ({
    project_id: row.project_id,
    project_name: row.project_name,
    paid: roundMoney(Number(row.paid)),
    received: roundMoney(Number(row.received)),
  }))
}

export async function projectSpendByCategory(db: DbClient, projectId: string, bookId: string) {
  // Read from journal lines (net debit - credit), not accounting_transactions.direction: a reversal of a
  // money_out is posted as its own money_in-direction transaction (see postingService.ts's reversalHeader),
  // which a direction = 'money_out' filter would never see - so a fully-reversed expense would keep showing
  // its full original amount here forever. The category line always keeps the SAME account_id on both the
  // original and its reversal (only debit/credit swap), so summing debit - credit per account cancels a
  // reversed line out automatically, the same way Trial Balance and Account Statement already do.
  const result = await db.query(
    `SELECT aa.id AS account_id, aa.name AS account_name, sum(jl.debit) - sum(jl.credit) AS amount
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = jl.account_id
     WHERE jl.project_id = $1 AND jl.book_id = $2 AND jl.cash_account_id IS NULL AND je.status = 'posted'
       AND je.entry_kind <> 'opening_balance' AND aa.type IN ('expense', 'asset')
     GROUP BY aa.id, aa.name
     HAVING sum(jl.debit) - sum(jl.credit) <> 0
     ORDER BY amount DESC`,
    [projectId, bookId]
  )
  return result.rows.map((row) => ({ account_id: row.account_id, account_name: row.account_name, amount: roundMoney(Number(row.amount)) }))
}

// A separate management breakdown: classification tags describe client spending without entering P&L.
export async function projectClientDisbursements(db: DbClient, projectId: string, bookId: string) {
  const result = await db.query(
    `SELECT a.id AS account_id, a.name AS account_name, sum(t.amount) AS amount
     FROM accounting_transactions t
     JOIN accounting_accounts a ON a.id = t.classification_account_id
     WHERE t.project_id = $1 AND t.book_id = $2 AND t.status = 'posted' AND t.direction = 'money_out' AND ${EXCLUDE_REVERSAL_PAIRS_SQL}
     GROUP BY a.id, a.name ORDER BY amount DESC`,
    [projectId, bookId]
  )
  return result.rows.map((row) => ({ ...row, amount: roundMoney(Number(row.amount)) }))
}

// ---------- Historical (imported) cash movement ----------
//
// The historical Polypus importer writes accounting_journal_entries/accounting_journal_lines directly - it
// never creates an accounting_transactions row (that table describes what a human filled in on Add
// Transaction; the import has no such human-facing event to record). So every function above this comment,
// which reads only accounting_transactions, correctly returns $0 for 100% real, correctly-posted imported
// history - and every function below exists to add that history back in, from the ledger itself, without
// ever double-counting a native entry (which always has exactly one accounting_transactions row - see that
// table's unique index - so "NOT EXISTS a transactions row for this entry" cleanly means "historical/import
// only" for any entry, present or future).
//
// A line counts as a genuine historical cash movement once it has cash_account_id set (every historical cash/
// bank/petty line was backfilled - see accounting-backfill-cash-accounts.ts) AND the entry is posted, is not
// an opening balance, and is not a pure cash-to-cash transfer (EVERY line in the entry cash-tagged - the same
// thing accounting_transactions.direction = 'transfer' means for native activity).
const HISTORICAL_CASH_LEG_SQL = `
  jl.cash_account_id IS NOT NULL
  AND je.status = 'posted'
  AND je.entry_kind <> 'opening_balance'
  AND NOT EXISTS (SELECT 1 FROM accounting_transactions t WHERE t.journal_entry_id = je.id)
  AND EXISTS (SELECT 1 FROM accounting_journal_lines other WHERE other.journal_entry_id = je.id AND other.cash_account_id IS NULL)
`

export async function historicalCashTotals(db: DbClient, bookId: string, month?: string | null): Promise<{ received: number; paid: number }> {
  const monthCondition = month ? `AND to_char(je.entry_date, 'YYYY-MM') = $2` : ''
  const params = month ? [bookId, month] : [bookId]
  const result = await db.query(
    `SELECT coalesce(sum(jl.debit), 0) AS received, coalesce(sum(jl.credit), 0) AS paid
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.book_id = $1 AND ${HISTORICAL_CASH_LEG_SQL} ${monthCondition}`,
    params
  )
  const row = result.rows[0]
  return { received: roundMoney(Number(row.received)), paid: roundMoney(Number(row.paid)) }
}

// Breakdown of historical cash movement by whatever dimension the OTHER (non-cash) line(s) of the same entry
// carry - a complex multi-line historical voucher fans out to each dimension it actually touches, the same
// way projectSpendByCategory/projectSpendByPayee already attribute a multi-line entry's cost across accounts.
async function historicalCashByDimension(
  db: DbClient, bookId: string, dimensionColumn: 'counterparty_id' | 'account_id' | 'legacy_job_id', month?: string | null
): Promise<{ dim_id: string; received: number; paid: number }[]> {
  const monthCondition = month ? `AND to_char(je.entry_date, 'YYYY-MM') = $2` : ''
  const params = month ? [bookId, month] : [bookId]
  const result = await db.query(
    `SELECT other.${dimensionColumn} AS dim_id,
            coalesce(sum(jl.debit), 0) AS received,
            coalesce(sum(jl.credit), 0) AS paid
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_journal_lines other ON other.journal_entry_id = je.id AND other.id <> jl.id
       AND other.cash_account_id IS NULL AND other.${dimensionColumn} IS NOT NULL
     WHERE je.book_id = $1 AND ${HISTORICAL_CASH_LEG_SQL} ${monthCondition}
     GROUP BY other.${dimensionColumn}`,
    params
  )
  return result.rows.map((r) => ({ dim_id: r.dim_id, received: roundMoney(Number(r.received)), paid: roundMoney(Number(r.paid)) }))
}

export async function historicalCashByCategory(db: DbClient, bookId: string, month?: string | null) {
  const rows = await historicalCashByDimension(db, bookId, 'account_id', month)
  if (rows.length === 0) return []
  const names = await db.query(`SELECT id, name FROM accounting_accounts WHERE id = ANY($1)`, [rows.map((r) => r.dim_id)])
  const nameById = new Map(names.rows.map((r) => [r.id, r.name]))
  return rows.map((r) => ({ account_id: r.dim_id, account_name: nameById.get(r.dim_id) ?? 'Unknown', received: r.received, paid: r.paid }))
}

export async function historicalCashByCounterparty(db: DbClient, bookId: string, month?: string | null) {
  const rows = await historicalCashByDimension(db, bookId, 'counterparty_id', month)
  if (rows.length === 0) return []
  const names = await db.query(`SELECT id, name FROM accounting_counterparties WHERE id = ANY($1)`, [rows.map((r) => r.dim_id)])
  const nameById = new Map(names.rows.map((r) => [r.id, r.name]))
  return rows.map((r) => ({ counterparty_id: r.dim_id, counterparty_name: nameById.get(r.dim_id) ?? 'Unknown', received: r.received, paid: r.paid }))
}

export async function historicalCashByLegacyJob(db: DbClient, bookId: string, month?: string | null) {
  const rows = await historicalCashByDimension(db, bookId, 'legacy_job_id', month)
  if (rows.length === 0) return []
  const names = await db.query(`SELECT id, legacy_job_name FROM accounting_legacy_jobs WHERE id = ANY($1)`, [rows.map((r) => r.dim_id)])
  const nameById = new Map(names.rows.map((r) => [r.id, r.legacy_job_name]))
  return rows.map((r) => ({ legacy_job_id: r.dim_id, legacy_job_name: nameById.get(r.dim_id) ?? 'Unknown', received: r.received, paid: r.paid }))
}

export async function historicalCashByCashAccount(db: DbClient, bookId: string, month?: string | null) {
  const monthCondition = month ? `AND to_char(je.entry_date, 'YYYY-MM') = $2` : ''
  const params = month ? [bookId, month] : [bookId]
  const result = await db.query(
    `SELECT ca.id AS cash_account_id, ca.name AS cash_account_name,
            coalesce(sum(jl.debit), 0) AS received, coalesce(sum(jl.credit), 0) AS paid
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_cash_accounts ca ON ca.id = jl.cash_account_id
     WHERE je.book_id = $1 AND ${HISTORICAL_CASH_LEG_SQL} ${monthCondition}
     GROUP BY ca.id, ca.name`,
    params
  )
  return result.rows.map((r) => ({ cash_account_id: r.cash_account_id, cash_account_name: r.cash_account_name, received: roundMoney(Number(r.received)), paid: roundMoney(Number(r.paid)) }))
}

// A payee's historical paid/received: sum of the debit(=paid to them)/credit(=received from them) on THEIR
// OWN journal line, restricted to entries that also have a genuine cash leg (so a pure revenue-recognition
// entry like an invoice draw-down, which touches no cash account at all, is correctly excluded from "paid").
export async function payeeHistoricalTotals(db: DbClient, counterpartyId: string): Promise<{ paid: number; received: number }> {
  const result = await db.query(
    `SELECT coalesce(sum(jl.debit), 0) AS paid, coalesce(sum(jl.credit), 0) AS received
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.counterparty_id = $1 AND je.status = 'posted' AND je.entry_kind <> 'opening_balance'
       AND NOT EXISTS (SELECT 1 FROM accounting_transactions t WHERE t.journal_entry_id = je.id)
       AND EXISTS (SELECT 1 FROM accounting_journal_lines cash WHERE cash.journal_entry_id = je.id AND cash.cash_account_id IS NOT NULL)`,
    [counterpartyId]
  )
  const row = result.rows[0]
  return { paid: roundMoney(Number(row.paid)), received: roundMoney(Number(row.received)) }
}

// A legacy job's totals/breakdowns. legacy_job_id is usually only set on the COST/counterparty leg of a
// historical voucher, not the cash leg (Polypus rarely tagged the JobID on the cash side) - so "received"/
// "spent" for a job is attributed via the ENTRY: whenever ANY line in the entry carries this legacy_job_id,
// the entry's own cash leg(s) count toward that job's received/spent.
export async function legacyJobTotals(db: DbClient, legacyJobId: string): Promise<{ received: number; paid: number }> {
  const result = await db.query(
    `SELECT coalesce(sum(cash.debit), 0) AS received, coalesce(sum(cash.credit), 0) AS paid
     FROM accounting_journal_lines job_line
     JOIN accounting_journal_entries je ON je.id = job_line.journal_entry_id
     JOIN accounting_journal_lines cash ON cash.journal_entry_id = je.id AND cash.cash_account_id IS NOT NULL
     WHERE job_line.legacy_job_id = $1 AND je.status = 'posted' AND je.entry_kind <> 'opening_balance'
       AND EXISTS (SELECT 1 FROM accounting_journal_lines other WHERE other.journal_entry_id = je.id AND other.cash_account_id IS NULL)`,
    [legacyJobId]
  )
  const row = result.rows[0]
  return { received: roundMoney(Number(row.received)), paid: roundMoney(Number(row.paid)) }
}

export async function legacyJobSpendByCategory(db: DbClient, legacyJobId: string) {
  const result = await db.query(
    `SELECT aa.id AS account_id, aa.name AS account_name, sum(jl.debit) - sum(jl.credit) AS amount
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = jl.account_id
     WHERE jl.legacy_job_id = $1 AND jl.cash_account_id IS NULL AND je.status = 'posted'
       AND je.entry_kind <> 'opening_balance' AND aa.type IN ('expense', 'asset')
     GROUP BY aa.id, aa.name
     HAVING sum(jl.debit) - sum(jl.credit) <> 0
     ORDER BY amount DESC`,
    [legacyJobId]
  )
  return result.rows.map((row) => ({ account_id: row.account_id, account_name: row.account_name, amount: roundMoney(Number(row.amount)) }))
}

export async function legacyJobSpendByPayee(db: DbClient, legacyJobId: string) {
  const result = await db.query(
    `SELECT cp.id AS counterparty_id, cp.name AS counterparty_name, sum(jl.debit) - sum(jl.credit) AS amount
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_counterparties cp ON cp.id = jl.counterparty_id
     WHERE jl.legacy_job_id = $1 AND jl.cash_account_id IS NULL AND je.status = 'posted' AND je.entry_kind <> 'opening_balance'
     GROUP BY cp.id, cp.name
     HAVING sum(jl.debit) - sum(jl.credit) <> 0
     ORDER BY amount DESC`,
    [legacyJobId]
  )
  return result.rows.map((row) => ({ counterparty_id: row.counterparty_id, counterparty_name: row.counterparty_name, amount: roundMoney(Number(row.amount)) }))
}

// Full journal history for a legacy job: every entry that has at least one line tagged with this job,
// with ALL of that entry's lines (so the cash leg and the cost/payee leg both show), newest first.
export async function legacyJobHistory(db: DbClient, legacyJobId: string) {
  const result = await db.query(
    `SELECT je.id AS journal_entry_id, je.entry_date, je.reference, je.description, je.entry_kind,
            jl.id AS line_id, jl.debit, jl.credit, jl.memo,
            aa.name AS account_name, aa.code AS account_code,
            cp.id AS counterparty_id, cp.name AS counterparty_name,
            ca.name AS cash_account_name,
            lr.legacy_jv_id, lr.legacy_narration, lr.legacy_reference, lr.legacy_base2_amount, lr.legacy_fx_rate
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = jl.account_id
     LEFT JOIN accounting_counterparties cp ON cp.id = jl.counterparty_id
     LEFT JOIN accounting_cash_accounts ca ON ca.id = jl.cash_account_id
     LEFT JOIN accounting_legacy_journal_line_ref lr ON lr.journal_line_id = jl.id
     WHERE je.id IN (SELECT DISTINCT journal_entry_id FROM accounting_journal_lines WHERE legacy_job_id = $1)
       AND je.status = 'posted'
     ORDER BY je.entry_date DESC, je.id DESC, jl.id`,
    [legacyJobId]
  )
  return result.rows.map((row) => ({ ...row, debit: Number(row.debit), credit: Number(row.credit), legacy_base2_amount: row.legacy_base2_amount === null ? null : Number(row.legacy_base2_amount) }))
}

// Historical journal history for one counterparty, shaped as closely as possible to the native
// accounting_transactions-based history (same field names) so the client can render both in one table.
// direction is derived from whichever OTHER line in the same entry is the cash leg (debit = money_in,
// credit = money_out); an entry with no cash leg at all (e.g. a fee invoice recognizing revenue against an
// existing advance) is labelled 'non_cash', matching what that direction already means for native activity.
//
// The "cash"/"other" lookups match by AMOUNT (jl's own debit/credit against the candidate's opposite side),
// never just "any other line in the same journal entry" - the historical importer preserves one legacy
// voucher as one journal entry even when that voucher bundles several unrelated people's transactions into
// one JV (e.g. a monthly payroll run: Ghida/Reem/Omar/... all paid in a single legacy JVID), so "same entry"
// alone does not mean "the other half of MY pair". Without the amount match, this previously picked an
// arbitrary other person's cash/category line - e.g. showing Ghida's $1,800 salary line with a $2,000
// (Omar's) or $1,300 (Reem's/Abbas's) amount, since Postgres has no defined order for an unqualified LIMIT 1.
export async function payeeHistoricalHistory(db: DbClient, counterpartyId: string) {
  const result = await db.query(
    `SELECT 'je-' || je.id AS id,
            je.entry_date AS transaction_date, je.currency_code, je.entry_kind,
            coalesce(jl.debit, 0) - coalesce(jl.credit, 0) AS signed_amount,
            cash.debit AS cash_debit, cash.credit AS cash_credit, ca.name AS cash_account_name,
            other.account_name AS category_name,
            lj.legacy_job_name,
            lr.legacy_jv_id, lr.legacy_narration, lr.legacy_reference
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     LEFT JOIN LATERAL (
       SELECT c.debit, c.credit, c.cash_account_id FROM accounting_journal_lines c
       WHERE c.journal_entry_id = je.id AND c.cash_account_id IS NOT NULL AND c.id <> jl.id
         AND ((jl.debit > 0 AND c.credit = jl.debit) OR (jl.credit > 0 AND c.debit = jl.credit))
       LIMIT 1
     ) cash ON true
     LEFT JOIN accounting_cash_accounts ca ON ca.id = cash.cash_account_id
     LEFT JOIN LATERAL (
       SELECT oaa.name AS account_name, o.legacy_job_id FROM accounting_journal_lines o
       JOIN accounting_accounts oaa ON oaa.id = o.account_id
       WHERE o.journal_entry_id = je.id AND o.id <> jl.id AND o.cash_account_id IS NULL
         AND ((jl.debit > 0 AND o.credit = jl.debit) OR (jl.credit > 0 AND o.debit = jl.credit))
       LIMIT 1
     ) other ON true
     LEFT JOIN accounting_legacy_jobs lj ON lj.id = coalesce(jl.legacy_job_id, other.legacy_job_id)
     LEFT JOIN accounting_legacy_journal_line_ref lr ON lr.journal_line_id = jl.id
     WHERE jl.counterparty_id = $1 AND je.status = 'posted'
       AND NOT EXISTS (SELECT 1 FROM accounting_transactions t WHERE t.journal_entry_id = je.id)
     ORDER BY je.entry_date DESC, je.id DESC`,
    [counterpartyId]
  )
  return result.rows.map((row) => {
    const cashDebit = row.cash_debit === null ? null : Number(row.cash_debit)
    const cashCredit = row.cash_credit === null ? null : Number(row.cash_credit)
    const direction = cashDebit ? 'money_in' : cashCredit ? 'money_out' : 'non_cash'
    const amount = cashDebit || cashCredit || Math.abs(Number(row.signed_amount))
    return {
      id: row.id, direction, transaction_date: row.transaction_date, amount: roundMoney(amount), currency_code: row.currency_code,
      description: row.legacy_narration ?? null, status: 'posted', project_id: null,
      project_name: row.legacy_job_name ?? null, category_name: row.category_name ?? null, classification_name: null,
      cash_account_name: row.cash_account_name ?? null, reversed_by_transaction_id: null,
      legacy_jv_id: row.legacy_jv_id ?? null, legacy_reference: row.legacy_reference ?? null,
    }
  })
}

// Professional fees, kept strictly separate from client/project funds (requirement 6): INC-FEES only ever
// gets credited by revenue recognition (an invoice), never by a client advance/funds-held movement (those
// post to LIA-CLIENTADV/LIA-CLIENTFUNDS) - so this is a clean, single-account read, correct for native and
// historical activity alike since both post through the same ledger account.
export async function professionalFeesSummary(db: DbClient, bookId: string): Promise<{ invoiced: number; collected: number; outstanding: number }> {
  const invoicedResult = await db.query(
    `SELECT coalesce(sum(jl.credit) - sum(jl.debit), 0) AS invoiced
     FROM accounting_journal_lines jl JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = jl.account_id
     WHERE aa.book_id = $1 AND aa.code = 'INC-FEES' AND je.status = 'posted'`,
    [bookId]
  )
  const receivableResult = await db.query(
    `SELECT coalesce(sum(jl.debit) - sum(jl.credit), 0) AS outstanding
     FROM accounting_journal_lines jl JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = jl.account_id
     WHERE aa.book_id = $1 AND aa.code = 'AST-RECV' AND je.status = 'posted'`,
    [bookId]
  )
  const invoiced = roundMoney(Number(invoicedResult.rows[0].invoiced))
  const outstanding = roundMoney(Number(receivableResult.rows[0].outstanding))
  return { invoiced, outstanding, collected: roundMoney(invoiced - outstanding) }
}

// Powers the Dashboard's drill-down for HISTORICAL activity, filtered the same way
// GET /api/accounting/transactions filters native rows, so "every displayed total must drill down to the
// exact journal entries that produce it" holds for imported history too. Anchored on the cash leg (this is
// always a money_in/money_out-shaped listing, never a transfer or opening line - those are excluded, matching
// what accounting_transactions.direction already means). Filters that name a dimension (counterparty/
// category) are matched via EXISTS against every OTHER line in the entry, not just one representative line -
// a complex multi-line historical voucher touching several categories must be found by all of them.
export type HistoricalTransactionFilters = {
  counterpartyId?: string | null
  cashAccountId?: string | null
  categoryAccountId?: string | null
  direction?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  projectId?: string | null // never matches (historical lines have no project_id) - kept for signature symmetry
}

export async function historicalTransactionsList(db: DbClient, bookId: string, filters: HistoricalTransactionFilters) {
  if (filters.projectId) return [] // no historical line has ever carried a project_id
  const conditions = [
    `je.book_id = $1`, `jl.cash_account_id IS NOT NULL`, `je.status = 'posted'`, `je.entry_kind <> 'opening_balance'`,
    `NOT EXISTS (SELECT 1 FROM accounting_transactions t WHERE t.journal_entry_id = je.id)`,
    `EXISTS (SELECT 1 FROM accounting_journal_lines x WHERE x.journal_entry_id = je.id AND x.cash_account_id IS NULL)`,
  ]
  const params: unknown[] = [bookId]
  if (filters.cashAccountId) { params.push(filters.cashAccountId); conditions.push(`jl.cash_account_id = $${params.length}`) }
  if (filters.direction === 'money_in') conditions.push(`jl.debit > 0`)
  if (filters.direction === 'money_out') conditions.push(`jl.credit > 0`)
  if (filters.dateFrom) { params.push(filters.dateFrom); conditions.push(`je.entry_date >= $${params.length}`) }
  if (filters.dateTo) { params.push(filters.dateTo); conditions.push(`je.entry_date <= $${params.length}`) }
  if (filters.counterpartyId) {
    params.push(filters.counterpartyId)
    conditions.push(`EXISTS (SELECT 1 FROM accounting_journal_lines x WHERE x.journal_entry_id = je.id AND x.counterparty_id = $${params.length})`)
  }
  if (filters.categoryAccountId) {
    params.push(filters.categoryAccountId)
    conditions.push(`EXISTS (SELECT 1 FROM accounting_journal_lines x WHERE x.journal_entry_id = je.id AND x.account_id = $${params.length} AND x.cash_account_id IS NULL)`)
  }

  const result = await db.query(
    `SELECT 'je-' || je.id AS id, je.entry_date AS transaction_date,
            (CASE WHEN jl.debit > 0 THEN 'money_in' ELSE 'money_out' END) AS direction,
            greatest(jl.debit, jl.credit) AS amount,
            coalesce(lr.legacy_narration, je.description) AS description,
            NULL::bigint AS project_id, lj.legacy_job_name AS project_name,
            other_cp.id AS counterparty_id, other_cp.name AS counterparty_name,
            other_aa.id AS category_account_id, other_aa.name AS category_name,
            ca.id AS from_cash_account_id, ca.name AS from_cash_account_name, NULL::bigint AS to_cash_account_id, NULL AS to_cash_account_name,
            je.id AS journal_entry_id, NULL::bigint AS reversal_of_transaction_id, NULL::bigint AS reversed_by_transaction_id
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_cash_accounts ca ON ca.id = jl.cash_account_id
     LEFT JOIN accounting_legacy_journal_line_ref lr ON lr.journal_line_id = jl.id
     LEFT JOIN LATERAL (
       -- Matched by amount, not just "any other line in the entry" - see payeeHistoricalHistory's comment
       -- for why a bundled legacy voucher (e.g. a monthly payroll run) makes that ambiguous otherwise.
       SELECT o.account_id, o.counterparty_id, o.legacy_job_id FROM accounting_journal_lines o
       WHERE o.journal_entry_id = je.id AND o.id <> jl.id AND o.cash_account_id IS NULL
         AND ((jl.debit > 0 AND o.credit = jl.debit) OR (jl.credit > 0 AND o.debit = jl.credit))
       ORDER BY (o.counterparty_id IS NOT NULL)::int DESC LIMIT 1
     ) other ON true
     LEFT JOIN accounting_accounts other_aa ON other_aa.id = other.account_id
     LEFT JOIN accounting_counterparties other_cp ON other_cp.id = other.counterparty_id
     LEFT JOIN accounting_legacy_jobs lj ON lj.id = other.legacy_job_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY je.entry_date DESC, je.id DESC
     LIMIT 500`,
    params
  )
  return result.rows.map((row) => ({ ...row, amount: roundMoney(Number(row.amount)) }))
}

export async function projectSpendByPayee(db: DbClient, projectId: string, bookId: string) {
  // Same reasoning as projectSpendByCategory above - net debit - credit over journal lines, not a
  // direction = 'money_out' filter over accounting_transactions, so a reversed payment nets to zero here too.
  const result = await db.query(
    `SELECT cp.id AS counterparty_id, cp.name AS counterparty_name, sum(jl.debit) - sum(jl.credit) AS amount
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = jl.account_id
     JOIN accounting_counterparties cp ON cp.id = jl.counterparty_id
     WHERE jl.project_id = $1 AND jl.book_id = $2 AND jl.cash_account_id IS NULL AND je.status = 'posted'
       AND je.entry_kind <> 'opening_balance' AND aa.type IN ('expense', 'asset')
     GROUP BY cp.id, cp.name
     HAVING sum(jl.debit) - sum(jl.credit) <> 0
     ORDER BY amount DESC`,
    [projectId, bookId]
  )
  return result.rows.map((row) => ({ counterparty_id: row.counterparty_id, counterparty_name: row.counterparty_name, amount: roundMoney(Number(row.amount)) }))
}
