import type { Express } from 'express'
import { pool } from '../db'
import { HttpError, roundMoney, sendError } from '../http'
import { EXCLUDE_REVERSAL_PAIRS_SQL, requireBookId, queryString } from './helpers'
import { cashAccountBalance, historicalCashTotals, historicalCashByCategory, historicalCashByCounterparty, historicalCashByCashAccount } from './queries'

// Merges a native (accounting_transactions-based) breakdown with a historical (journal-lines-based) one that
// shares the same dimension id, so e.g. a payee paid both before the import cutover and via a native
// transaction shows one combined row - never two separate, confusing entries for the same real-world payee.
function mergeBreakdowns<T extends { money_in: number; money_out: number }>(
  native: (T & Record<string, unknown>)[], idKey: string, historical: { received: number; paid: number; [k: string]: unknown }[], historicalIdKey: string
): T[] {
  const byId = new Map<string, T & Record<string, unknown>>()
  for (const row of native) byId.set(String(row[idKey]), { ...row })
  for (const row of historical) {
    const id = String(row[historicalIdKey])
    const existing = byId.get(id)
    if (existing) {
      existing.money_in = Number(existing.money_in) + row.received
      existing.money_out = Number(existing.money_out) + row.paid
    } else {
      byId.set(id, { ...row, [idKey]: row[historicalIdKey], money_in: row.received, money_out: row.paid } as unknown as T & Record<string, unknown>)
    }
  }
  return [...byId.values()] as T[]
}

// A separate route from the existing /api/dashboard (design-fee/labor-cost dashboard) - this one is purely
// about cash movement in the accounting books, and never touches the existing dashboard's tables or query.
export function registerAccountingDashboardRoutes(app: Express) {
  app.get('/api/accounting/dashboard', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const month = queryString(req.query.month) // YYYY-MM
      if (month && !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Month must be in YYYY-MM format')

      const monthCondition = month ? `AND to_char(t.transaction_date, 'YYYY-MM') = $2` : ''
      const params = month ? [bookId, month] : [bookId]

      // Transfers never count as money in/out - direction excludes 'transfer' by only summing money_in/money_out.
      // A fully reversed pair (the original and the transaction that corrected it) contributes nothing here -
      // it was a mistake that was undone, not two genuine cash events - see EXCLUDE_REVERSAL_PAIRS_SQL.
      const totals = await pool.query(
        `SELECT coalesce(sum(amount) FILTER (WHERE direction = 'money_in'), 0) AS money_in,
                coalesce(sum(amount) FILTER (WHERE direction = 'money_out'), 0) AS money_out
         FROM accounting_transactions t
         WHERE t.book_id = $1 AND t.status = 'posted' AND t.direction IN ('money_in', 'money_out')
           AND ${EXCLUDE_REVERSAL_PAIRS_SQL} ${monthCondition}`,
        params
      )

      const cashAccounts = await pool.query(
        `SELECT id, name, kind, project_id FROM accounting_cash_accounts WHERE book_id = $1 AND is_active ORDER BY name`,
        [bookId]
      )
      const cashBalances = await Promise.all(
        cashAccounts.rows.map(async (row) => ({ ...row, balance: await cashAccountBalance(pool, row.id) }))
      )

      const byProject = await pool.query(
        `SELECT projects.id AS project_id, projects.name AS project_name,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_in'), 0) AS money_in,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_out'), 0) AS money_out
         FROM accounting_transactions t
         JOIN projects ON projects.id = t.project_id
         WHERE t.book_id = $1 AND t.status = 'posted' AND t.direction IN ('money_in', 'money_out')
           AND ${EXCLUDE_REVERSAL_PAIRS_SQL} ${monthCondition}
         GROUP BY projects.id, projects.name
         HAVING sum(t.amount) FILTER (WHERE t.direction = 'money_in') > 0 OR sum(t.amount) FILTER (WHERE t.direction = 'money_out') > 0
         ORDER BY money_out DESC`,
        params
      )

      // Each breakdown below has BOTH money_in and money_out as columns on the same row (like by_project
      // above), rather than one row per direction - and, like the totals above, excludes fully reversed pairs
      // (EXCLUDE_REVERSAL_PAIRS_SQL) so a corrected mistake doesn't show up as a genuine event in either
      // column. The HAVING clause drops a row that had activity only from an excluded pair, so a category/
      // payee/cash account whose only history was "paid, then corrected" doesn't linger as a confusing $0 row.
      const byCategory = await pool.query(
        `SELECT aa.id AS account_id, aa.name AS account_name,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_in'), 0) AS money_in,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_out'), 0) AS money_out
         FROM accounting_transactions t
         JOIN accounting_accounts aa ON aa.id = t.category_account_id
         WHERE t.book_id = $1 AND t.status = 'posted' AND t.direction IN ('money_in', 'money_out')
           AND ${EXCLUDE_REVERSAL_PAIRS_SQL} ${monthCondition}
         GROUP BY aa.id, aa.name
         HAVING sum(t.amount) FILTER (WHERE t.direction = 'money_in') > 0 OR sum(t.amount) FILTER (WHERE t.direction = 'money_out') > 0
         ORDER BY money_out DESC`,
        params
      )

      const byCounterparty = await pool.query(
        `SELECT cp.id AS counterparty_id, cp.name AS counterparty_name,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_in'), 0) AS money_in,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_out'), 0) AS money_out
         FROM accounting_transactions t
         JOIN accounting_counterparties cp ON cp.id = t.counterparty_id
         WHERE t.book_id = $1 AND t.status = 'posted' AND t.direction IN ('money_in', 'money_out')
           AND ${EXCLUDE_REVERSAL_PAIRS_SQL} ${monthCondition}
         GROUP BY cp.id, cp.name
         HAVING sum(t.amount) FILTER (WHERE t.direction = 'money_in') > 0 OR sum(t.amount) FILTER (WHERE t.direction = 'money_out') > 0
         ORDER BY money_out DESC`,
        params
      )

      const byCashAccount = await pool.query(
        `SELECT ca.id AS cash_account_id, ca.name AS cash_account_name,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_in'), 0) AS money_in,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_out'), 0) AS money_out
         FROM accounting_transactions t
         JOIN accounting_cash_accounts ca ON ca.id = coalesce(t.from_cash_account_id, t.to_cash_account_id)
         WHERE t.book_id = $1 AND t.status = 'posted' AND t.direction IN ('money_in', 'money_out')
           AND ${EXCLUDE_REVERSAL_PAIRS_SQL} ${monthCondition}
         GROUP BY ca.id, ca.name
         HAVING sum(t.amount) FILTER (WHERE t.direction = 'money_in') > 0 OR sum(t.amount) FILTER (WHERE t.direction = 'money_out') > 0
         ORDER BY money_out DESC`,
        params
      )

      // Everything below adds the historical (imported Polypus) cash movement on top of the native totals
      // above - see queries.ts's historicalCashTotals for why this can never double-count a native entry.
      const historicalTotals = await historicalCashTotals(pool, bookId, month)
      const historicalByCategory = await historicalCashByCategory(pool, bookId, month)
      const historicalByCounterparty = await historicalCashByCounterparty(pool, bookId, month)
      const historicalByCashAccount = await historicalCashByCashAccount(pool, bookId, month)

      const nativeByCategory = byCategory.rows.map((r) => ({ ...r, money_in: Number(r.money_in), money_out: Number(r.money_out) }))
      const nativeByCounterparty = byCounterparty.rows.map((r) => ({ ...r, money_in: Number(r.money_in), money_out: Number(r.money_out) }))
      const nativeByCashAccount = byCashAccount.rows.map((r) => ({ ...r, money_in: Number(r.money_in), money_out: Number(r.money_out) }))

      res.json({
        money_in: roundMoney(Number(totals.rows[0].money_in) + historicalTotals.received),
        money_out: roundMoney(Number(totals.rows[0].money_out) + historicalTotals.paid),
        cash_balances: cashBalances,
        by_project: byProject.rows.map((r) => ({ ...r, money_in: Number(r.money_in), money_out: Number(r.money_out) })),
        by_category: mergeBreakdowns(nativeByCategory, 'account_id', historicalByCategory, 'account_id').sort((a, b) => b.money_out - a.money_out),
        by_counterparty: mergeBreakdowns(nativeByCounterparty, 'counterparty_id', historicalByCounterparty, 'counterparty_id').sort((a, b) => b.money_out - a.money_out),
        by_cash_account: mergeBreakdowns(nativeByCashAccount, 'cash_account_id', historicalByCashAccount, 'cash_account_id').sort((a, b) => b.money_out - a.money_out),
      })
    } catch (err) {
      sendError(res, err, 'Failed to load the accounting dashboard')
    }
  })
}
