import type { Express } from 'express'
import { pool } from '../db'
import { HttpError, sendError } from '../http'
import { requireBookId, queryId, queryString } from './helpers'
import { cashAccountBalance, projectClientDisbursements, projectSpendByCategory, projectSpendByPayee, projectTotals, payeeTotals, payeeTotalsByProject, trialBalance } from './queries'

// All reports read posted entries only, per the hard invariant that reports must reconcile to what was
// actually posted - a draft or reversed row never appears in a report total.

export function registerAccountingReportRoutes(app: Express) {
  app.get('/api/accounting/reports/general-journal', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const dateFrom = queryString(req.query.date_from)
      const dateTo = queryString(req.query.date_to)
      const conditions = ['je.book_id = $1', `je.status = 'posted'`]
      const params: unknown[] = [bookId]
      if (dateFrom) { params.push(dateFrom); conditions.push(`je.entry_date >= $${params.length}`) }
      if (dateTo) { params.push(dateTo); conditions.push(`je.entry_date <= $${params.length}`) }

      const result = await pool.query(
        `SELECT je.id AS journal_entry_id, je.entry_date, je.reference, je.description, je.currency_code, je.entry_kind,
                jl.account_id, aa.name AS account_name, jl.debit, jl.credit, jl.memo
         FROM accounting_journal_entries je
         JOIN accounting_journal_lines jl ON jl.journal_entry_id = je.id
         JOIN accounting_accounts aa ON aa.id = jl.account_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY je.entry_date, je.id, jl.id`,
        params
      )
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to build the general journal')
    }
  })

  app.get('/api/accounting/reports/trial-balance', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      res.json(await trialBalance(pool, bookId))
    } catch (err) {
      sendError(res, err, 'Failed to build the trial balance')
    }
  })

  app.get('/api/accounting/reports/account-statement', async (req, res) => {
    try {
      const accountId = queryId(req.query.account_id)
      if (!accountId) throw new HttpError(400, 'An account must be selected')
      const dateFrom = queryString(req.query.date_from)
      const dateTo = queryString(req.query.date_to)
      const conditions = ['jl.account_id = $1', `je.status = 'posted'`]
      const params: unknown[] = [accountId]
      if (dateFrom) { params.push(dateFrom); conditions.push(`je.entry_date >= $${params.length}`) }
      if (dateTo) { params.push(dateTo); conditions.push(`je.entry_date <= $${params.length}`) }

      const account = await pool.query('SELECT id, name, normal_balance FROM accounting_accounts WHERE id = $1', [accountId])
      if (account.rows.length === 0) throw new HttpError(404, 'Account not found')

      const lines = await pool.query(
        `SELECT je.id AS journal_entry_id, je.entry_date, je.reference, je.description, jl.debit, jl.credit, jl.memo
         FROM accounting_journal_lines jl
         JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY je.entry_date, je.id`,
        params
      )

      const sign = account.rows[0].normal_balance === 'debit' ? 1 : -1
      let running = 0
      const rows = lines.rows.map((row) => {
        running += sign * (Number(row.debit) - Number(row.credit))
        return { ...row, running_balance: Math.round(running * 100) / 100 }
      })
      res.json({ account: account.rows[0], lines: rows })
    } catch (err) {
      sendError(res, err, 'Failed to build the account statement')
    }
  })

  app.get('/api/accounting/reports/cash-account-statement', async (req, res) => {
    try {
      const cashAccountId = queryId(req.query.cash_account_id)
      if (!cashAccountId) throw new HttpError(400, 'A cash account must be selected')
      const dateFrom = queryString(req.query.date_from)
      const dateTo = queryString(req.query.date_to)
      const conditions = ['jl.cash_account_id = $1', `je.status = 'posted'`]
      const params: unknown[] = [cashAccountId]
      if (dateFrom) { params.push(dateFrom); conditions.push(`je.entry_date >= $${params.length}`) }
      if (dateTo) { params.push(dateTo); conditions.push(`je.entry_date <= $${params.length}`) }

      const cashAccount = await pool.query('SELECT id, name, kind FROM accounting_cash_accounts WHERE id = $1', [cashAccountId])
      if (cashAccount.rows.length === 0) throw new HttpError(404, 'Cash account not found')

      const lines = await pool.query(
        `SELECT je.id AS journal_entry_id, je.entry_date, je.reference, je.description, jl.debit, jl.credit, jl.memo
         FROM accounting_journal_lines jl
         JOIN accounting_journal_entries je ON je.id = jl.journal_entry_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY je.entry_date, je.id`,
        params
      )

      let running = 0
      const rows = lines.rows.map((row) => {
        running += Number(row.debit) - Number(row.credit)
        return { ...row, running_balance: Math.round(running * 100) / 100 }
      })
      res.json({ cash_account: cashAccount.rows[0], lines: rows })
    } catch (err) {
      sendError(res, err, 'Failed to build the cash account statement')
    }
  })

  app.get('/api/accounting/reports/project-statement', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const projectId = queryId(req.query.project_id)
      if (!projectId) throw new HttpError(400, 'A project must be selected')

      const project = await pool.query('SELECT id, name FROM projects WHERE id = $1', [projectId])
      if (project.rows.length === 0) throw new HttpError(404, 'Project not found')

      const totals = await projectTotals(pool, projectId, bookId)
      const byCategory = await projectSpendByCategory(pool, projectId, bookId)
      const byPayee = await projectSpendByPayee(pool, projectId, bookId)

      const fundAccounts = await pool.query(
        `SELECT id, name FROM accounting_cash_accounts WHERE project_id = $1 AND book_id = $2 AND is_active`,
        [projectId, bookId]
      )
      const fundBalances = await Promise.all(
        fundAccounts.rows.map(async (row) => ({ ...row, balance: await cashAccountBalance(pool, row.id) }))
      )

      const history = await pool.query(
        `SELECT t.id, t.direction, t.transaction_date, t.amount, t.currency_code, t.description, t.status,
                cp.id AS counterparty_id, cp.name AS counterparty_name,
                aa.name AS category_name,
                cls.name AS classification_name,
                coalesce(fca.name, tca.name) AS cash_account_name,
                (SELECT r.id FROM accounting_transactions r WHERE r.reversal_of_transaction_id = t.id) AS reversed_by_transaction_id
         FROM accounting_transactions t
         LEFT JOIN accounting_counterparties cp ON cp.id = t.counterparty_id
         LEFT JOIN accounting_accounts aa ON aa.id = t.category_account_id
         LEFT JOIN accounting_accounts cls ON cls.id = t.classification_account_id
         LEFT JOIN accounting_cash_accounts fca ON fca.id = t.from_cash_account_id
         LEFT JOIN accounting_cash_accounts tca ON tca.id = t.to_cash_account_id
         WHERE t.project_id = $1 AND t.book_id = $2
         ORDER BY t.transaction_date DESC, t.id DESC`,
        [projectId, bookId]
      )

      res.json({
        project: project.rows[0],
        ...totals,
        fund_balances: fundBalances,
        spend_by_category: byCategory,
        spend_by_payee: byPayee,
        client_disbursements_by_category: await projectClientDisbursements(pool, projectId, bookId),
        history: history.rows,
      })
    } catch (err) {
      sendError(res, err, 'Failed to build the project statement')
    }
  })

  app.get('/api/accounting/reports/payee-statement', async (req, res) => {
    try {
      const counterpartyId = queryId(req.query.counterparty_id)
      if (!counterpartyId) throw new HttpError(400, 'A payee must be selected')

      const counterparty = await pool.query('SELECT id, name, kind FROM accounting_counterparties WHERE id = $1', [counterpartyId])
      if (counterparty.rows.length === 0) throw new HttpError(404, 'Payee not found')

      const totals = await payeeTotals(pool, counterpartyId)
      const byProject = await payeeTotalsByProject(pool, counterpartyId)
      const history = await pool.query(
        `SELECT t.id, t.direction, t.transaction_date, t.amount, t.currency_code, t.description, t.status,
                projects.id AS project_id, projects.name AS project_name,
                aa.name AS category_name,
                cls.name AS classification_name,
                coalesce(fca.name, tca.name) AS cash_account_name,
                (SELECT r.id FROM accounting_transactions r WHERE r.reversal_of_transaction_id = t.id) AS reversed_by_transaction_id
         FROM accounting_transactions t
         LEFT JOIN projects ON projects.id = t.project_id
         LEFT JOIN accounting_accounts aa ON aa.id = t.category_account_id
         LEFT JOIN accounting_accounts cls ON cls.id = t.classification_account_id
         LEFT JOIN accounting_cash_accounts fca ON fca.id = t.from_cash_account_id
         LEFT JOIN accounting_cash_accounts tca ON tca.id = t.to_cash_account_id
         WHERE t.counterparty_id = $1
         ORDER BY t.transaction_date DESC, t.id DESC`,
        [counterpartyId]
      )

      res.json({ counterparty: counterparty.rows[0], ...totals, by_project: byProject, history: history.rows })
    } catch (err) {
      sendError(res, err, 'Failed to build the payee statement')
    }
  })
}
