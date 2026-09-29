// Corrected historical (Polypus-imported) reporting - additive, parallel to queries.ts's original historical
// functions, exactly the same architecture the original importer used ("a parallel, additive query layer...
// merges with the existing totals"). These functions read accounting_legacy_line_classification (backfilled
// once, read-only afterwards, by accounting-classify-legacy-history.ts) instead of trusting the generic
// imported account/target code, per the 100% coverage audit (chat history, 2026-09-29):
//   - a client's receivable-vs-advance state is computed from their FULL counterparty-level running balance,
//     never from the AST-RECV/LIA-CLIENTADV account a given historical line happened to post to (that routing
//     is provably wrong for 22 lines/11 transaction pairs - the "overshoot" MAPPING_ERROR class);
//   - "professional fees collected" only counts lines with source-proven RCV cash-sweep evidence, never every
//     line mapped to INC-FEES (28 lines/$275,395 are a "full-reinvoice" bookkeeping artifact, not revenue -
//     the other MAPPING_ERROR class);
//   - a client's construction deposit is never presented as company revenue or gross "money received" without
//     also being visible, separately, as client/project funds.
// No accounting_journal_lines.debit/credit/account_id is ever written by anything in this file.
import type { PoolClient } from 'pg'
import { roundMoney } from '../http'

type DbClient = Pick<PoolClient, 'query'>

const CONFIRMED_FEE_CLASS = 'confirmed professional-fee collection / RCV sweep'

// ---------- Company: confirmed professional fees ----------
//
// Scoped to the SOURCE (job-linked) cash pots only, net of any correction/refund swept back in - e.g.
// Btater's $120 "Return to Btater due to wrong calculation" was itself entered via the Receipts & Payments
// (RCV) screen, so summing every RCV-tagged line's debit side gross (as if it were all "collected") would
// double count: money that both left and came back via RCV is not a fee. Every RCV sweep observed in the
// source data originates from a job-linked pot and lands in a non-job (operating) pot, so net(credit-debit)
// on the job-linked pots alone equals the true amount permanently retained by the company - conservation
// guarantees this matches summing net(debit-credit) on the destination side instead.
export async function confirmedProfessionalFeesCollected(db: DbClient, bookId: string): Promise<number> {
  const r = await db.query(
    `SELECT coalesce(sum(jl.credit) - sum(jl.debit), 0) AS total
     FROM accounting_legacy_line_classification c
     JOIN accounting_journal_lines jl ON jl.id = c.journal_line_id
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_cash_accounts ca ON ca.id = jl.cash_account_id
     WHERE je.book_id = $1 AND c.semantic_class = $2 AND c.status = 'VERIFIED' AND je.status = 'posted' AND ca.legacy_job_id IS NOT NULL`,
    [bookId, CONFIRMED_FEE_CLASS]
  )
  return roundMoney(Number(r.rows[0].total))
}

// ---------- Company: operating expenses / payroll / partner funding (historical, classification-driven) ----------

export async function historicalCompanyCashFlow(db: DbClient, bookId: string): Promise<{
  companyOperatingExpensesPaid: number
  payrollPaid: number
  partnerFundingIn: number
  partnerDrawingsOut: number
}> {
  const r = await db.query(
    `SELECT c.semantic_class,
            coalesce(sum(jl.credit) FILTER (WHERE jl.cash_account_id IS NOT NULL), 0) AS cash_out,
            coalesce(sum(jl.debit) FILTER (WHERE jl.cash_account_id IS NOT NULL), 0) AS cash_in
     FROM accounting_legacy_line_classification c
     JOIN accounting_journal_lines jl ON jl.id = c.journal_line_id
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.book_id = $1 AND je.status = 'posted'
       AND c.semantic_class IN ('company operating expense', 'payroll', 'partner funding/drawing')
     GROUP BY c.semantic_class`,
    [bookId]
  )
  const byClass = new Map(r.rows.map((row) => [row.semantic_class, { cashOut: Number(row.cash_out), cashIn: Number(row.cash_in) }]))
  return {
    companyOperatingExpensesPaid: roundMoney(byClass.get('company operating expense')?.cashOut ?? 0),
    payrollPaid: roundMoney(byClass.get('payroll')?.cashOut ?? 0),
    partnerFundingIn: roundMoney(byClass.get('partner funding/drawing')?.cashIn ?? 0),
    partnerDrawingsOut: roundMoney(byClass.get('partner funding/drawing')?.cashOut ?? 0),
  }
}

// ---------- Client/project funds (book-wide) ----------

export async function historicalClientProjectFunds(db: DbClient, bookId: string): Promise<{ clientFundsReceived: number; projectCostsPaid: number }> {
  const r = await db.query(
    `SELECT coalesce(sum(jl.debit) FILTER (WHERE jl.cash_account_id IS NOT NULL), 0) AS received,
            coalesce(sum(jl.credit) FILTER (WHERE jl.cash_account_id IS NOT NULL), 0) AS paid
     FROM accounting_legacy_line_classification c
     JOIN accounting_journal_lines jl ON jl.id = c.journal_line_id
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.book_id = $1 AND je.status = 'posted' AND c.semantic_class = 'client project funding'`,
    [bookId]
  )
  return { clientFundsReceived: roundMoney(Number(r.rows[0].received)), projectCostsPaid: roundMoney(Number(r.rows[0].paid)) }
}

// ---------- Internal transfers (disclosed, not silently dropped) ----------

export async function historicalInternalTransfers(db: DbClient, bookId: string): Promise<number> {
  const r = await db.query(
    `SELECT coalesce(sum(jl.debit), 0) AS total
     FROM accounting_legacy_line_classification c
     JOIN accounting_journal_lines jl ON jl.id = c.journal_line_id
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.book_id = $1 AND je.status = 'posted' AND c.semantic_class = 'internal cash/bank transfer'`,
    [bookId]
  )
  return roundMoney(Number(r.rows[0].total))
}

// ---------- Clients: receivable vs advance/held, from the client's COMPLETE counterparty-level balance -----
// Never from the AST-RECV/LIA-CLIENTADV account a line happened to post to - see the file header. A positive
// net (credit - debit) means Nextudio holds the client's money (advance/funds held); negative means the
// client owes Nextudio (receivable).
export type ClientControlBalance = {
  counterparty_id: string
  counterparty_name: string
  net_balance: number
  state: 'receivable' | 'advance_held' | 'settled'
}

export async function clientControlBalances(db: DbClient, bookId: string): Promise<ClientControlBalance[]> {
  const r = await db.query(
    `SELECT cp.id AS counterparty_id, cp.name AS counterparty_name,
            coalesce(sum(jl.credit) - sum(jl.debit), 0) AS net_balance
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_counterparties cp ON cp.id = jl.counterparty_id
     WHERE je.book_id = $1 AND je.status = 'posted' AND cp.kind = 'client'
     GROUP BY cp.id, cp.name
     HAVING coalesce(sum(jl.credit) - sum(jl.debit), 0) <> 0`,
    [bookId]
  )
  return r.rows.map((row) => {
    const net = roundMoney(Number(row.net_balance))
    return {
      counterparty_id: row.counterparty_id,
      counterparty_name: row.counterparty_name,
      net_balance: net,
      state: net > 0.01 ? 'advance_held' : net < -0.01 ? 'receivable' : 'settled',
    }
  })
}

// ---------- Per-legacy-job fund summary, from that job's dedicated historical cash pot (where one exists) --
// Uses accounting_cash_accounts.legacy_job_id, set by the cash-identity-split backfill for the jobs where the
// audit established a direct 1:1 pot<->job relationship (Btater, KZ Residence, AM Apartment). A job with no
// dedicated pot returns null - never a guessed or zero-filled figure standing in for "unknown".
export type LegacyJobFundSummary = {
  clientFundsReceived: number
  genuineProjectCostsPaid: number
  confirmedFeesCollected: number
  remainingProjectFunds: number
  cashAccountId: string
  cashAccountName: string
}

export async function legacyJobFundSummary(db: DbClient, legacyJobId: string): Promise<LegacyJobFundSummary | null> {
  const cashAccount = await db.query(`SELECT id, name FROM accounting_cash_accounts WHERE legacy_job_id = $1`, [legacyJobId])
  if (cashAccount.rows.length === 0) return null
  const { id: cashAccountId, name: cashAccountName } = cashAccount.rows[0]

  // "received"/"costs" exclude RCV-tagged lines entirely (both sides): an RCV sweep is Nextudio's own fee
  // movement, never new client money or a project cost, and it can include a same-mechanism CORRECTION (e.g.
  // Btater's $120 "Return to Btater due to wrong calculation" refund, also entered via the Receipts & Payments
  // screen) - so "confirmed fees collected" must be the RCV-tagged lines' NET (credit swept out minus debit
  // swept back in), not just the gross credit side, or a corrected-down fee would silently overstate revenue.
  const totals = await db.query(
    `SELECT coalesce(sum(jl.debit) FILTER (WHERE c.semantic_class IS DISTINCT FROM $2 OR c.status IS DISTINCT FROM 'VERIFIED'), 0) AS received,
            coalesce(sum(jl.credit) FILTER (WHERE c.semantic_class IS DISTINCT FROM $2 OR c.status IS DISTINCT FROM 'VERIFIED'), 0) AS costs_paid,
            coalesce(sum(jl.credit) FILTER (WHERE c.semantic_class = $2 AND c.status = 'VERIFIED'), 0)
              - coalesce(sum(jl.debit) FILTER (WHERE c.semantic_class = $2 AND c.status = 'VERIFIED'), 0) AS fees_collected
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     LEFT JOIN accounting_legacy_line_classification c ON c.journal_line_id = jl.id
     WHERE jl.cash_account_id = $1 AND je.status = 'posted'`,
    [cashAccountId, CONFIRMED_FEE_CLASS]
  )
  const row = totals.rows[0]
  const received = roundMoney(Number(row.received))
  const feesCollected = roundMoney(Number(row.fees_collected))
  const costsPaid = roundMoney(Number(row.costs_paid))
  return {
    clientFundsReceived: received,
    genuineProjectCostsPaid: costsPaid,
    confirmedFeesCollected: feesCollected,
    remainingProjectFunds: roundMoney(received - costsPaid - feesCollected),
    cashAccountId,
    cashAccountName,
  }
}

// ---------- Historical Review Needed: every PRESERVED_AMBIGUOUS line, for management to resolve later -------
export type HistoricalReviewItem = {
  book_code: string
  legacy_jv_id: number
  legacy_value_date: string | null
  legacy_account_number: string | null
  legacy_account_name: string | null
  amount: number
  legacy_job_name: string | null
  counterparty_name: string | null
  tentative_class: string
  reason: string | null
}

export async function historicalReviewNeeded(db: DbClient, bookId: string): Promise<HistoricalReviewItem[]> {
  const r = await db.query(
    `SELECT lr.legacy_book_code AS book_code, lr.legacy_jv_id, lr.legacy_value_date, lr.legacy_account_number,
            lr.legacy_narration, aa.name AS legacy_account_name,
            greatest(jl.debit, jl.credit) AS amount,
            lj.legacy_job_name, cp.name AS counterparty_name,
            c.semantic_class AS tentative_class, c.note AS reason
     FROM accounting_legacy_line_classification c
     JOIN accounting_journal_lines jl ON jl.id = c.journal_line_id
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_legacy_journal_line_ref lr ON lr.journal_line_id = jl.id
     LEFT JOIN accounting_accounts aa ON aa.id = jl.account_id
     LEFT JOIN accounting_legacy_jobs lj ON lj.id = jl.legacy_job_id
     LEFT JOIN accounting_counterparties cp ON cp.id = jl.counterparty_id
     WHERE je.book_id = $1 AND c.status = 'PRESERVED_AMBIGUOUS'
     ORDER BY lr.legacy_value_date DESC NULLS LAST, lr.legacy_jv_id DESC`,
    [bookId]
  )
  return r.rows.map((row) => ({
    book_code: row.book_code,
    legacy_jv_id: row.legacy_jv_id,
    legacy_value_date: row.legacy_value_date,
    legacy_account_number: row.legacy_account_number,
    legacy_account_name: row.legacy_account_name,
    amount: roundMoney(Number(row.amount)),
    legacy_job_name: row.legacy_job_name,
    counterparty_name: row.counterparty_name,
    tentative_class: row.tentative_class,
    reason: row.reason ?? row.legacy_narration ?? null,
  }))
}

// ---------- Verification: any remaining MAPPING_ERROR items in the classification (should be zero) ----------
export async function remainingMappingErrors(db: DbClient): Promise<{ count: number }> {
  const r = await db.query(`SELECT count(*)::int AS n FROM accounting_legacy_line_classification WHERE status = 'MAPPING_ERROR'`)
  return { count: r.rows[0].n }
}
