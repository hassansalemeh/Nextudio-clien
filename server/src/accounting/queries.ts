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
    `SELECT coalesce(sum(jl.debit), 0) AS total_debit, coalesce(sum(jl.credit), 0) AS total_credit, aa.normal_balance
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
  return roundMoney(normal_balance === 'debit' ? net : -net)
}

export type TrialBalanceRow = {
  account_id: string
  code: string | null
  name: string
  type: string
  total_debit: number
  total_credit: number
  balance: number
}

export async function trialBalance(db: DbClient, bookId: string): Promise<TrialBalanceRow[]> {
  const result = await db.query(
    `SELECT aa.id AS account_id, aa.code, aa.name, aa.type, aa.normal_balance,
            coalesce(sum(jl.debit), 0) AS total_debit, coalesce(sum(jl.credit), 0) AS total_credit
     FROM accounting_accounts aa
     LEFT JOIN accounting_journal_lines jl ON jl.account_id = aa.id
     LEFT JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
     WHERE aa.book_id = $1
     GROUP BY aa.id, aa.code, aa.name, aa.type, aa.normal_balance
     ORDER BY aa.type, aa.name`,
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
export async function projectTotals(db: DbClient, projectId: string): Promise<{ received: number; paid: number }> {
  const result = await db.query(
    `SELECT coalesce(sum(amount) FILTER (WHERE direction = 'money_in'), 0) AS received,
            coalesce(sum(amount) FILTER (WHERE direction = 'money_out'), 0) AS paid
     FROM accounting_transactions t
     WHERE t.project_id = $1 AND t.status = 'posted' AND ${EXCLUDE_REVERSAL_PAIRS_SQL}`,
    [projectId]
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

export async function projectSpendByCategory(db: DbClient, projectId: string) {
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
     WHERE jl.project_id = $1 AND jl.cash_account_id IS NULL AND je.status = 'posted' AND aa.type IN ('expense', 'asset')
     GROUP BY aa.id, aa.name
     HAVING sum(jl.debit) - sum(jl.credit) <> 0
     ORDER BY amount DESC`,
    [projectId]
  )
  return result.rows.map((row) => ({ account_id: row.account_id, account_name: row.account_name, amount: roundMoney(Number(row.amount)) }))
}

export async function projectSpendByPayee(db: DbClient, projectId: string) {
  // Same reasoning as projectSpendByCategory above - net debit - credit over journal lines, not a
  // direction = 'money_out' filter over accounting_transactions, so a reversed payment nets to zero here too.
  const result = await db.query(
    `SELECT cp.id AS counterparty_id, cp.name AS counterparty_name, sum(jl.debit) - sum(jl.credit) AS amount
     FROM accounting_journal_lines jl
     JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = jl.account_id
     JOIN accounting_counterparties cp ON cp.id = jl.counterparty_id
     WHERE jl.project_id = $1 AND jl.cash_account_id IS NULL AND je.status = 'posted' AND aa.type IN ('expense', 'asset')
     GROUP BY cp.id, cp.name
     HAVING sum(jl.debit) - sum(jl.credit) <> 0
     ORDER BY amount DESC`,
    [projectId]
  )
  return result.rows.map((row) => ({ counterparty_id: row.counterparty_id, counterparty_name: row.counterparty_name, amount: roundMoney(Number(row.amount)) }))
}
