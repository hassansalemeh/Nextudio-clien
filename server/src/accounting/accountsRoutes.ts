import type { Express, Request } from 'express'
import { pool } from '../db'
import { HttpError, sendError, withTransaction } from '../http'
import { writeAuditLog } from './auditLog'
import { requireBookId, requireParamId } from './helpers'
import { ACCOUNT_TYPES } from './types'
import type { AccountType } from './types'

// An account's normal balance side is implied entirely by its type - nobody picks debit/credit by hand.
function normalBalanceFor(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit'
}

type AccountInput = { book_id: string; code: string | null; name: string; type: AccountType; description: string | null }

function parseAccount(body: Record<string, unknown>): AccountInput {
  const book_id = requireBookId(body.book_id)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const type = body.type
  const code = typeof body.code === 'string' && body.code.trim() ? body.code.trim() : null
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null

  if (!name) throw new HttpError(400, 'Account name is required')
  if (typeof type !== 'string' || !(ACCOUNT_TYPES as readonly string[]).includes(type)) {
    throw new HttpError(400, 'Account type must be one of: ' + ACCOUNT_TYPES.join(', '))
  }
  return { book_id, code, name, type: type as AccountType, description }
}

function requireAccountId(req: Request) {
  return requireParamId(req, 'accountId', 'Account')
}

export function registerAccountingAccountRoutes(app: Express) {
  app.get('/api/accounting/accounts', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const result = await pool.query(
        `SELECT id, book_id, code, name, type, normal_balance, description, is_active, created_at
         FROM accounting_accounts WHERE book_id = $1 ORDER BY type, name`,
        [bookId]
      )
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch accounts')
    }
  })

  app.post('/api/accounting/accounts', async (req, res) => {
    try {
      const input = parseAccount(req.body)
      const normalBalance = normalBalanceFor(input.type)
      const userId = req.user!.id
      const id = await withTransaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO accounting_accounts (book_id, code, name, type, normal_balance, description)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [input.book_id, input.code, input.name, input.type, normalBalance, input.description]
        )
        await writeAuditLog(client, {
          book_id: input.book_id, entity_type: 'account', entity_id: inserted.rows[0].id,
          action: 'create', performed_by_user_id: userId, after: input,
        })
        return inserted.rows[0].id
      })
      const created = await pool.query(
        'SELECT id, book_id, code, name, type, normal_balance, description, is_active, created_at FROM accounting_accounts WHERE id = $1',
        [id]
      )
      res.status(201).json(created.rows[0])
    } catch (err) {
      sendError(res, err, 'Failed to create account', 'That account code is already used in this book')
    }
  })

  app.put('/api/accounting/accounts/:accountId', async (req, res) => {
    try {
      const id = requireAccountId(req)
      const input = parseAccount(req.body)
      const normalBalance = normalBalanceFor(input.type)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const before = await client.query('SELECT * FROM accounting_accounts WHERE id = $1 AND book_id = $2 FOR UPDATE', [id, input.book_id])
        if (before.rows.length === 0) throw new HttpError(404, 'Account not found')
        await client.query(
          `UPDATE accounting_accounts SET code = $2, name = $3, type = $4, normal_balance = $5, description = $6, updated_at = now() WHERE id = $1`,
          [id, input.code, input.name, input.type, normalBalance, input.description]
        )
        await writeAuditLog(client, {
          book_id: input.book_id, entity_type: 'account', entity_id: id,
          action: 'update', performed_by_user_id: userId, before: before.rows[0], after: input,
        })
      })
      const updated = await pool.query(
        'SELECT id, book_id, code, name, type, normal_balance, description, is_active, created_at FROM accounting_accounts WHERE id = $1',
        [id]
      )
      res.json(updated.rows[0])
    } catch (err) {
      sendError(res, err, 'Failed to update account', 'That account code is already used in this book')
    }
  })

  app.post('/api/accounting/accounts/:accountId/deactivate', async (req, res) => {
    try {
      const id = requireAccountId(req)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const current = await client.query('SELECT book_id, is_active FROM accounting_accounts WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Account not found')
        await client.query('UPDATE accounting_accounts SET is_active = false, updated_at = now() WHERE id = $1', [id])
        await writeAuditLog(client, {
          book_id: current.rows[0].book_id, entity_type: 'account', entity_id: id,
          action: 'deactivate', performed_by_user_id: userId,
        })
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to deactivate account')
    }
  })

  app.post('/api/accounting/accounts/:accountId/reactivate', async (req, res) => {
    try {
      const id = requireAccountId(req)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const current = await client.query('SELECT book_id, is_active FROM accounting_accounts WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Account not found')
        await client.query('UPDATE accounting_accounts SET is_active = true, updated_at = now() WHERE id = $1', [id])
        await writeAuditLog(client, {
          book_id: current.rows[0].book_id, entity_type: 'account', entity_id: id,
          action: 'reactivate', performed_by_user_id: userId,
        })
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to reactivate account')
    }
  })
}
