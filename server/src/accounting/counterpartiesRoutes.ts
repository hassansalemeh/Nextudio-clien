import type { Express, Request } from 'express'
import { pool } from '../db'
import { HttpError, sendError, withTransaction } from '../http'
import { writeAuditLog } from './auditLog'
import { requireBookId, requireParamId } from './helpers'
import { payeeTotals, payeeTotalsByProject, payeeHistoricalTotals } from './queries'
import { clientControlBalances } from './historicalCorrectedQueries'
import { COUNTERPARTY_KINDS } from './types'
import type { CounterpartyKind } from './types'

type CounterpartyInput = {
  book_id: string
  name: string
  kind: CounterpartyKind
  client_id: string | null
  employee_id: string | null
  contact_info: string | null
}

function parseCounterparty(body: Record<string, unknown>): CounterpartyInput {
  const book_id = requireBookId(body.book_id)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const kind = body.kind
  const client_id = body.client_id ? String(body.client_id) : null
  const employee_id = body.employee_id ? String(body.employee_id) : null
  const contact_info = typeof body.contact_info === 'string' && body.contact_info.trim() ? body.contact_info.trim() : null

  if (!name) throw new HttpError(400, 'Payee name is required')
  if (typeof kind !== 'string' || !(COUNTERPARTY_KINDS as readonly string[]).includes(kind)) {
    throw new HttpError(400, 'Kind must be one of: ' + COUNTERPARTY_KINDS.join(', '))
  }
  return { book_id, name, kind: kind as CounterpartyKind, client_id, employee_id, contact_info }
}

function requireCounterpartyId(req: Request) {
  return requireParamId(req, 'counterpartyId', 'Payee')
}

export function registerAccountingCounterpartyRoutes(app: Express) {
  // kind=payees|clients|partners narrows the list to the matching counterparty kinds, so the client can keep
  // Payees (suppliers/contractors/consultants/workers/employees), Clients (funding/receivable/advance) and
  // Partners (funding/drawings) as conceptually separate lists/pages, never mixing a client into "Payees".
  const KIND_GROUPS: Record<string, CounterpartyKind[]> = {
    payees: ['worker', 'contractor', 'supplier', 'consultant', 'employee'],
    clients: ['client'],
    partners: ['partner'],
  }
  app.get('/api/accounting/counterparties', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const group = typeof req.query.kind === 'string' ? KIND_GROUPS[req.query.kind] : undefined
      const kindFilter = group ? ` AND cp.kind = ANY($2)` : ''
      const params = group ? [bookId, group] : [bookId]
      const result = await pool.query(
        `SELECT cp.id, cp.book_id, cp.name, cp.kind, cp.client_id, cp.employee_id, cp.contact_info, cp.is_active, cp.created_at,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_out' AND t.status = 'posted'), 0) AS paid,
                coalesce(sum(t.amount) FILTER (WHERE t.direction = 'money_in' AND t.status = 'posted'), 0) AS received
         FROM accounting_counterparties cp
         LEFT JOIN accounting_transactions t ON t.counterparty_id = cp.id
         WHERE cp.book_id = $1${kindFilter}
         GROUP BY cp.id
         ORDER BY paid DESC, cp.name`,
        params
      )
      // Adds imported historical paid/received on top of native totals - see payeeHistoricalTotals for why
      // this never double-counts a native transaction. For a client, "Total Paid" from actual cash settlement
      // evidence is meaningless (a client is never paid by Nextudio) - net_balance/state (from the client's
      // COMPLETE counterparty-level running balance, never a single target-account code) replaces it instead.
      const withHistorical = await Promise.all(
        result.rows.map(async (row) => {
          const hist = await payeeHistoricalTotals(pool, row.id)
          return { ...row, paid: Number(row.paid) + hist.paid, received: Number(row.received) + hist.received }
        })
      )
      if (req.query.kind === 'clients') {
        const balances = await clientControlBalances(pool, bookId)
        const byId = new Map(balances.map((b) => [b.counterparty_id, b]))
        const withBalance = withHistorical.map((row) => ({ ...row, net_balance: byId.get(row.id)?.net_balance ?? 0, state: byId.get(row.id)?.state ?? 'settled' }))
        withBalance.sort((a, b) => a.net_balance - b.net_balance)
        res.json(withBalance)
        return
      }
      withHistorical.sort((a, b) => b.paid - a.paid)
      res.json(withHistorical)
    } catch (err) {
      sendError(res, err, 'Failed to fetch payees')
    }
  })

  app.get('/api/accounting/counterparties/:counterpartyId', async (req, res) => {
    try {
      const id = requireCounterpartyId(req)
      const counterparty = await pool.query(
        `SELECT id, book_id, name, kind, client_id, employee_id, contact_info, is_active, created_at FROM accounting_counterparties WHERE id = $1`,
        [id]
      )
      if (counterparty.rows.length === 0) throw new HttpError(404, 'Payee not found')

      const totals = await payeeTotals(pool, id)
      const byProject = await payeeTotalsByProject(pool, id)
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
        [id]
      )

      res.json({ ...counterparty.rows[0], ...totals, by_project: byProject, history: history.rows })
    } catch (err) {
      sendError(res, err, 'Failed to fetch payee')
    }
  })

  app.post('/api/accounting/counterparties', async (req, res) => {
    try {
      const input = parseCounterparty(req.body)
      const userId = req.user!.id
      const id = await withTransaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO accounting_counterparties (book_id, name, kind, client_id, employee_id, contact_info)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [input.book_id, input.name, input.kind, input.client_id, input.employee_id, input.contact_info]
        )
        await writeAuditLog(client, {
          book_id: input.book_id, entity_type: 'counterparty', entity_id: inserted.rows[0].id,
          action: 'create', performed_by_user_id: userId, after: input,
        })
        return inserted.rows[0].id
      })
      res.status(201).json({ id, ...input, is_active: true })
    } catch (err) {
      sendError(res, err, 'Failed to create payee')
    }
  })

  app.put('/api/accounting/counterparties/:counterpartyId', async (req, res) => {
    try {
      const id = requireCounterpartyId(req)
      const input = parseCounterparty(req.body)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const before = await client.query('SELECT * FROM accounting_counterparties WHERE id = $1 AND book_id = $2 FOR UPDATE', [id, input.book_id])
        if (before.rows.length === 0) throw new HttpError(404, 'Payee not found')
        await client.query(
          `UPDATE accounting_counterparties SET name = $2, kind = $3, client_id = $4, employee_id = $5, contact_info = $6, updated_at = now()
           WHERE id = $1`,
          [id, input.name, input.kind, input.client_id, input.employee_id, input.contact_info]
        )
        await writeAuditLog(client, {
          book_id: input.book_id, entity_type: 'counterparty', entity_id: id,
          action: 'update', performed_by_user_id: userId, before: before.rows[0], after: input,
        })
      })
      res.json({ id, ...input })
    } catch (err) {
      sendError(res, err, 'Failed to update payee')
    }
  })

  app.post('/api/accounting/counterparties/:counterpartyId/deactivate', async (req, res) => {
    try {
      const id = requireCounterpartyId(req)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const current = await client.query('SELECT book_id FROM accounting_counterparties WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Payee not found')
        await client.query('UPDATE accounting_counterparties SET is_active = false, updated_at = now() WHERE id = $1', [id])
        await writeAuditLog(client, {
          book_id: current.rows[0].book_id, entity_type: 'counterparty', entity_id: id,
          action: 'deactivate', performed_by_user_id: userId,
        })
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to deactivate payee')
    }
  })

  app.post('/api/accounting/counterparties/:counterpartyId/reactivate', async (req, res) => {
    try {
      const id = requireCounterpartyId(req)
      const userId = req.user!.id
      await withTransaction(async (client) => {
        const current = await client.query('SELECT book_id FROM accounting_counterparties WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Payee not found')
        await client.query('UPDATE accounting_counterparties SET is_active = true, updated_at = now() WHERE id = $1', [id])
        await writeAuditLog(client, {
          book_id: current.rows[0].book_id, entity_type: 'counterparty', entity_id: id,
          action: 'reactivate', performed_by_user_id: userId,
        })
      })
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to reactivate payee')
    }
  })
}
