import type { Express, Request } from 'express'
import type { PoolClient } from 'pg'
import { randomUUID } from 'crypto'
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
  // Required for every kind except project_fund, where it is always ignored: a project fund always gets its
  // own dedicated ledger account, auto-created with the fund - never
  // shared with another project's fund, so DNT Cash and SBM Cash can never be mixed together on a statement.
  ledger_account_id: string | null
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
  if (kind === 'project_fund') {
    if (!project_id) throw new HttpError(400, 'A project fund account must be linked to a project')
  } else if (!ledger_account_id || !/^\d+$/.test(String(ledger_account_id))) {
    throw new HttpError(400, 'Choose the ledger account this posts to')
  }
  if (!/^[A-Z]{3}$/.test(currency_code)) throw new HttpError(400, 'Currency must be a 3-letter code such as USD')

  return {
    book_id, name, kind: kind as CashAccountKind,
    ledger_account_id: kind === 'project_fund' ? null : String(ledger_account_id),
    project_id, currency_code,
  }
}

async function assertLedgerAccountIsAsset(bookId: string, ledgerAccountId: string) {
  const result = await pool.query('SELECT type, code, is_active FROM accounting_accounts WHERE id = $1 AND book_id = $2', [ledgerAccountId, bookId])
  if (result.rows.length === 0) throw new HttpError(400, 'The ledger account does not exist in this book')
  if (result.rows[0].type !== 'asset') throw new HttpError(400, 'A cash/bank account must post to an asset account')
  if (!result.rows[0].is_active || result.rows[0].code === 'AST-PROJFUND') throw new HttpError(400, 'Choose an active posting account, not the project-funds group')
}

// One ledger per fund, including multiple funds belonging to the same project. Updates retain the
// original mapping; deactivated funds can be reactivated. New funds never reuse another fund's ledger.
export async function createProjectFundLedgerAccount(client: PoolClient, bookId: string, fundName: string, userId: string): Promise<string> {
  const code = `PROJFUND-${randomUUID()}`
  const parent = await client.query(`SELECT id FROM accounting_accounts WHERE book_id = $1 AND code = 'AST-PROJFUND'`, [bookId])
  const parentId = parent.rows[0]?.id ?? null

  const created = await client.query(
    `INSERT INTO accounting_accounts (book_id, code, name, type, normal_balance, description, parent_id)
     VALUES ($1, $2, $3, 'asset', 'debit', $4, $5) RETURNING id`,
    [bookId, code, fundName, 'Dedicated ledger account for one project fund - never shared with another project', parentId]
  )
  await writeAuditLog(client, {
    book_id: bookId, entity_type: 'account', entity_id: created.rows[0].id, action: 'create',
    performed_by_user_id: userId, after: { code, name: fundName, type: 'asset', parent_id: parentId },
    notes: 'Dedicated project fund ledger',
  })
  return created.rows[0].id
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
      if (input.kind !== 'project_fund') await assertLedgerAccountIsAsset(input.book_id, input.ledger_account_id!)
      const userId = req.user!.id
      const created = await withTransaction(async (client) => {
        const ledgerAccountId =
          input.kind === 'project_fund' ? await createProjectFundLedgerAccount(client, input.book_id, input.name, userId) : input.ledger_account_id!
        const inserted = await client.query(
          `INSERT INTO accounting_cash_accounts (book_id, name, kind, ledger_account_id, project_id, currency_code)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [input.book_id, input.name, input.kind, ledgerAccountId, input.project_id, input.currency_code]
        )
        await writeAuditLog(client, {
          book_id: input.book_id, entity_type: 'cash_account', entity_id: inserted.rows[0].id,
          action: 'create', performed_by_user_id: userId, after: { ...input, ledger_account_id: ledgerAccountId },
        })
        return { id: inserted.rows[0].id, ledger_account_id: ledgerAccountId }
      })
      res.status(201).json({ ...input, ...created, is_active: true, balance: 0 })
    } catch (err) {
      sendError(res, err, 'Failed to create cash account')
    }
  })

  app.put('/api/accounting/cash-accounts/:cashAccountId', async (req, res) => {
    try {
      const id = requireCashAccountId(req)
      const input = parseCashAccount(req.body)
      if (input.kind !== 'project_fund') await assertLedgerAccountIsAsset(input.book_id, input.ledger_account_id!)
      const userId = req.user!.id
      const ledgerAccountId = await withTransaction(async (client) => {
        const before = await client.query('SELECT * FROM accounting_cash_accounts WHERE id = $1 AND book_id = $2 FOR UPDATE', [id, input.book_id])
        if (before.rows.length === 0) throw new HttpError(404, 'Cash account not found')
        const previous = before.rows[0]
        if (previous.kind !== input.kind || previous.project_id !== input.project_id || previous.currency_code !== input.currency_code ||
            (input.kind !== 'project_fund' && previous.ledger_account_id !== input.ledger_account_id)) {
          throw new HttpError(400, 'Ledger, kind, project and currency are fixed when a cash account is created; create a new account instead')
        }
        const ledgerAccountId =
          previous.ledger_account_id
        await client.query(
          `UPDATE accounting_cash_accounts SET name = $2, kind = $3, ledger_account_id = $4, project_id = $5, currency_code = $6, updated_at = now()
           WHERE id = $1`,
          [id, input.name, input.kind, ledgerAccountId, input.project_id, input.currency_code]
        )
        await writeAuditLog(client, {
          book_id: input.book_id, entity_type: 'cash_account', entity_id: id,
          action: 'update', performed_by_user_id: userId, before: before.rows[0], after: { ...input, ledger_account_id: ledgerAccountId },
        })
        return ledgerAccountId
      })
      res.json({ id, ...input, ledger_account_id: ledgerAccountId })
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
