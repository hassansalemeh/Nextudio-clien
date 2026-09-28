import type { Express, Request } from 'express'
import { pool } from '../db'
import { HttpError, sendError, withTransaction } from '../http'
import { writeAuditLog } from './auditLog'
import { requireBookId, requireParamId } from './helpers'
import { cashAccountBalance } from './queries'
import { CASH_ACCOUNT_KINDS } from './types'
import type { CashAccountKind } from './types'

type CashAccountInput = {
  book_id: string
  name: string
  kind: CashAccountKind
  ledger_account_id: string
  project_id: string | null
  currency_code: string
}

function parseCashAccount(body: Record<string, unknown>): CashAccountInput {
  const book_id = requireBookId(body.book_id)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const kind = body.kind
  const ledger_account_id = body.ledger_account_id
  const project_id = body.project_id ? String(body.project_id) : null
  const currency_code = typeof body.currency_code === 'string' && body.currency_code.trim() ? body.currency_code.trim().toUpperCase() : 'USD'

  if (!name) throw new HttpError(400, 'Account name is required')
  if (typeof kind !== 'string' || !(CASH_ACCOUNT_KINDS as readonly string[]).includes(kind)) {
    throw new HttpError(400, 'Kind must be one of: ' + CASH_ACCOUNT_KINDS.join(', '))
  }
  if (!ledger_account_id || !/^\d+$/.test(String(ledger_account_id))) throw new HttpError(400, 'Choose the ledger account this posts to')
  if (kind === 'project_fund' && !project_id) throw new HttpError(400, 'A project fund account must be linked to a project')
  if (!/^[A-Z]{3}$/.test(currency_code)) throw new HttpError(400, 'Currency must be a 3-letter code such as USD')

  return { book_id, name, kind: kind as CashAccountKind, ledger_account_id: String(ledger_account_id), project_id, currency_code }
}

async function assertLedgerAccountIsAsset(bookId: string, ledgerAccountId: string) {
  const result = await pool.query('SELECT type FROM accounting_accounts WHERE id = $1 AND book_id = $2', [ledgerAccountId, bookId])
  if (result.rows.length === 0) throw new HttpError(400, 'The ledger account does not exist in this book')
  if (result.rows[0].type !== 'asset') throw new HttpError(400, 'A cash/bank account must post to an asset account')
}

function requireCashAccountId(req: Request) {
  return requireParamId(req, 'cashAccountId', 'Cash account')
}

export function registerAccountingCashAccountRoutes(app: Express) {
  app.get('/api/accounting/cash-accounts', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const result = await pool.query(
        `SELECT ca.id, ca.book_id, ca.name, ca.kind, ca.ledger_account_id, aa.name AS ledger_account_name,
                ca.project_id, projects.name AS project_name, ca.currency_code, ca.is_active, ca.created_at
         FROM accounting_cash_accounts ca
         JOIN accounting_accounts aa ON aa.id = ca.ledger_account_id
         LEFT JOIN projects ON projects.id = ca.project_id
         WHERE ca.book_id = $1
         ORDER BY ca.name`,
        [bookId]
      )
      const withBalances = await Promise.all(
        result.rows.map(async (row) => ({ ...row, balance: await cashAccountBalance(pool, row.id) }))
      )
      res.json(withBalances)
    } catch (err) {
      sendError(res, err, 'Failed to fetch cash accounts')
    }
  })

  app.post('/api/accounting/cash-accounts', async (req, res) => {
    try {
      const input = parseCashAccount(req.body)
      await assertLedgerAccountIsAsset(input.book_id, input.ledger_account_id)
      const userId = req.user!.id
      const id = await withTransaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, project_id, currency_code)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [input.book_id, input.name, input.kind, input.ledger_account_id, input.project_id, input.currency_code]
        )
        await writeAuditLog(client, {
          book_id: input.book_id, entity_type: 'cash_account', entity_id: inserted.rows[0].id,
          action: 'create', performed_by_user_id: userId, after: input,
        })
        return inserted.rows[0].id
      })
      res.status(201).json({ id, ...input, is_active: true, balance: 0 })
    } catch (err) {
      sendError(res, err, 'Failed to create cash account')
    }
  })

  app.put('/api/accounting/cash-accounts/:cashAccountId', async (req, res) => {
    try {
      const id = requireCashAccountId(req)
      const input = parseCashAccount(req.body)
      await assertLedgerAccountIsAsset(input.book_id, input.ledger_account_id)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const before = await client.query('SELECT * FROM accounting_cash_accounts WHERE id = $1 AND book_id = $2 FOR UPDATE', [id, input.book_id])
        if (before.rows.length === 0) throw new HttpError(404, 'Cash account not found')
        await client.query(
          `UPDATE accounting_cash_accounts SET name = $2, kind = $3, ledger_account_id = $4, project_id = $5, currency_code = $6, updated_at = now()
           WHERE id = $1`,
          [id, input.name, input.kind, input.ledger_account_id, input.project_id, input.currency_code]
        )
        await writeAuditLog(client, {
          book_id: input.book_id, entity_type: 'cash_account', entity_id: id,
          action: 'update', performed_by_user_id: userId, before: before.rows[0], after: input,
        })
      })
      res.json({ id, ...input })
    } catch (err) {
      sendError(res, err, 'Failed to update cash account')
    }
  })

  app.post('/api/accounting/cash-accounts/:cashAccountId/deactivate', async (req, res) => {
    try {
      const id = requireCashAccountId(req)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const current = await client.query('SELECT book_id FROM accounting_cash_accounts WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Cash account not found')
        await client.query('UPDATE accounting_cash_accounts SET is_active = false, updated_at = now() WHERE id = $1', [id])
        await writeAuditLog(client, {
          book_id: current.rows[0].book_id, entity_type: 'cash_account', entity_id: id,
          action: 'deactivate', performed_by_user_id: userId,
        })
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to deactivate cash account')
    }
  })

  app.post('/api/accounting/cash-accounts/:cashAccountId/reactivate', async (req, res) => {
    try {
      const id = requireCashAccountId(req)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const current = await client.query('SELECT book_id FROM accounting_cash_accounts WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Cash account not found')
        await client.query('UPDATE accounting_cash_accounts SET is_active = true, updated_at = now() WHERE id = $1', [id])
        await writeAuditLog(client, {
          book_id: current.rows[0].book_id, entity_type: 'cash_account', entity_id: id,
          action: 'reactivate', performed_by_user_id: userId,
        })
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to reactivate cash account')
    }
  })
}
