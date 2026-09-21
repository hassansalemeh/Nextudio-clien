import type { Express, Request } from 'express'
import type { PoolClient } from 'pg'
import { ESTIMATE_PREFIX, INVOICE_PAYMENT_TERM_DAYS, invoiceNumber } from './config'
import { pool } from './db'
import { HttpError, isIsoDate, roundMoney, sendError, withTransaction } from './http'

export const ESTIMATE_STATUSES = ['draft', 'pending', 'approved', 'rejected']
export const UNITS = ['sqm', 'lm', 'ls', 'pc', 'm3', 'sheet']
const DISCOUNT_TYPES = ['fixed', 'percent']
const MAX_ITEMS = 200

export type ItemInput = { name: string; description: string | null; quantity: number; unit: string; unit_price: number }

// The single place quotation totals are calculated. The client only displays what this returns.
export function computeTotals(items: { quantity: number; unit_price: number }[], discountType: string, discountValue: number) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + roundMoney(item.quantity * item.unit_price), 0))
  if (discountType === 'percent' && discountValue > 100) {
    throw new HttpError(400, 'A percentage discount cannot be more than 100%')
  }
  const discount = discountType === 'percent' ? roundMoney((subtotal * discountValue) / 100) : discountValue
  if (discount > subtotal) {
    throw new HttpError(400, 'The discount cannot be more than the subtotal')
  }
  return { subtotal, discount, total: roundMoney(subtotal - discount) }
}

// Long text sections keep their line breaks exactly as typed; only whitespace-only text counts as empty
function longText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw)) return []
  if (raw.length > MAX_ITEMS) throw new HttpError(400, `An estimate can have at most ${MAX_ITEMS} items`)
  return raw.map((item, index) => {
    const row = `Item ${index + 1}`
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const quantity = item?.quantity
    const unit_price = item?.unit_price
    if (!name) throw new HttpError(400, `${row}: service name is required`)
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      throw new HttpError(400, `${row}: quantity must be greater than 0`)
    }
    if (!UNITS.includes(item?.unit)) throw new HttpError(400, `${row}: unit must be one of ${UNITS.join(', ')}`)
    if (typeof unit_price !== 'number' || !Number.isFinite(unit_price) || unit_price < 0) {
      throw new HttpError(400, `${row}: unit price must be 0 or more`)
    }
    // Descriptions keep their line breaks exactly as typed
    const description = typeof item?.description === 'string' && item.description.trim() ? item.description : null
    return { name, description, quantity, unit: item.unit, unit_price }
  })
}

function parseHeader(body: Record<string, unknown>) {
  const estimate_number = typeof body.estimate_number === 'string' ? body.estimate_number.trim() : ''
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD'
  const status = body.status ?? 'draft'
  const estimate_date = body.estimate_date
  const valid_until = body.valid_until ? body.valid_until : null
  const discount_type = body.discount_type ?? 'fixed'
  const discount_value = body.discount_value ?? 0

  if (!estimate_number) throw new HttpError(400, 'Estimate number is required')
  if (!isIsoDate(estimate_date)) throw new HttpError(400, 'Estimate date is required')
  if (valid_until !== null && !isIsoDate(valid_until)) throw new HttpError(400, 'Valid until must be a valid date')
  if (valid_until !== null && valid_until < estimate_date) throw new HttpError(400, 'Valid until cannot be before the estimate date')
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Currency must be a 3-letter code such as USD')
  if (typeof status !== 'string' || !ESTIMATE_STATUSES.includes(status)) {
    throw new HttpError(400, 'Status must be one of: ' + ESTIMATE_STATUSES.join(', '))
  }
  if (typeof discount_type !== 'string' || !DISCOUNT_TYPES.includes(discount_type)) {
    throw new HttpError(400, 'Discount type must be fixed or percent')
  }
  if (typeof discount_value !== 'number' || !Number.isFinite(discount_value) || discount_value < 0) {
    throw new HttpError(400, 'Discount must be 0 or more')
  }

  return {
    estimate_number,
    title: optionalText(body.title) ?? 'Quotation',
    summary: optionalText(body.summary),
    client_id: body.client_id ? body.client_id : null,
    contact_name: optionalText(body.contact_name),
    customer_ref: optionalText(body.customer_ref),
    estimate_date,
    valid_until,
    currency,
    status,
    // Long terms keep their line breaks; only pure whitespace is treated as empty
    notes: longText(body.notes),
    payment_terms: longText(body.payment_terms),
    timeline: longText(body.timeline),
    exclusions: longText(body.exclusions),
    discount_type,
    discount_value,
    project_id: body.project_id ? body.project_id : null,
  }
}

const ESTIMATE_SELECT = `
  SELECT estimates.id, estimates.estimate_number, estimates.title, estimates.summary,
         estimates.client_id, clients.name AS client_name, estimates.contact_name, estimates.customer_ref,
         to_char(estimates.estimate_date, 'YYYY-MM-DD') AS estimate_date,
         to_char(estimates.valid_until, 'YYYY-MM-DD') AS valid_until,
         estimates.currency, estimates.status, estimates.notes, estimates.payment_terms, estimates.timeline, estimates.exclusions,
         estimates.subtotal, estimates.discount, estimates.discount_type, estimates.discount_value, estimates.total,
         estimates.project_id, estimates.approved_at,
         invoices.id AS invoice_id, invoices.invoice_number,
         (SELECT projects.id FROM projects WHERE projects.source_estimate_id = estimates.id) AS created_project_id
  FROM estimates
  LEFT JOIN clients ON clients.id = estimates.client_id
  LEFT JOIN invoices ON invoices.estimate_id = estimates.id`

export async function loadEstimate(estimateId: string | number, db: { query: PoolClient['query'] } = pool) {
  const result = await db.query(`${ESTIMATE_SELECT} WHERE estimates.id = $1`, [estimateId])
  if (result.rows.length === 0) return null
  const items = await db.query(
    `SELECT id, position, name, description, quantity, unit, unit_price, amount
     FROM estimate_items WHERE estimate_id = $1 ORDER BY position, id`,
    [estimateId]
  )
  return { ...result.rows[0], items: items.rows }
}

async function assertReferences(db: { query: PoolClient['query'] }, clientId: unknown, projectId: unknown) {
  if (clientId) {
    const client = await db.query('SELECT 1 FROM clients WHERE id = $1', [clientId])
    if (client.rows.length === 0) throw new HttpError(400, 'Client does not exist')
  }
  if (projectId) {
    const project = await db.query('SELECT 1 FROM projects WHERE id = $1', [projectId])
    if (project.rows.length === 0) throw new HttpError(400, 'Project does not exist')
  }
}

// Replaces all line items of an estimate and stores the backend-calculated totals
async function saveItemsAndTotals(client: PoolClient, estimateId: string | number, items: ItemInput[], discountType: string, discountValue: number) {
  const totals = computeTotals(items, discountType, discountValue)
  await client.query('DELETE FROM estimate_items WHERE estimate_id = $1', [estimateId])
  for (const [index, item] of items.entries()) {
    await client.query(
      `INSERT INTO estimate_items (estimate_id, position, name, description, quantity, unit, unit_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [estimateId, index, item.name, item.description, item.quantity, item.unit, item.unit_price]
    )
  }
  await client.query('UPDATE estimates SET subtotal = $2, discount = $3, total = $4 WHERE id = $1', [
    estimateId,
    totals.subtotal,
    totals.discount,
    totals.total,
  ])
}

// The next free estimate number: the highest trailing number in existing estimate numbers, plus one
async function nextEstimateNumber(db: { query: PoolClient['query'] } = pool): Promise<string> {
  const result = await db.query("SELECT estimate_number FROM estimates")
  let highest = 0
  for (const row of result.rows) {
    const match = /(\d+)\s*$/.exec(row.estimate_number)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  let candidate = highest + 1
  // never suggest a number that is already taken
  for (;;) {
    const number = ESTIMATE_PREFIX + String(candidate).padStart(4, '0')
    const taken = await db.query('SELECT 1 FROM estimates WHERE lower(estimate_number) = lower($1)', [number])
    if (taken.rows.length === 0) return number
    candidate++
  }
}

function requireId(req: Request) {
  const id = req.params.estimateId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Estimate not found')
  return id
}

// Approval creates the invoice and the project inside one transaction; it is safe to call repeatedly
async function approveEstimate(estimateId: string) {
  return withTransaction(async (client) => {
    // Lock the row so two simultaneous approvals run one after the other
    const locked = await client.query('SELECT id, status FROM estimates WHERE id = $1 FOR UPDATE', [estimateId])
    if (locked.rows.length === 0) throw new HttpError(404, 'Estimate not found')

    const existing = await client.query('SELECT id FROM invoices WHERE estimate_id = $1', [estimateId])
    if (existing.rows.length > 0) {
      return { created: false }
    }
    if (locked.rows[0].status === 'rejected') {
      throw new HttpError(400, 'A rejected estimate must be set back to Draft or Pending before it can be approved')
    }

    const estimate = await loadEstimate(estimateId, client)
    if (!estimate.client_id) throw new HttpError(400, 'Choose a customer before approving')
    if (estimate.items.length === 0) throw new HttpError(400, 'Add at least one item before approving')

    const invoiceDate = (await client.query("SELECT to_char(current_date, 'YYYY-MM-DD') AS d")).rows[0].d as string
    const seq = (await client.query("SELECT nextval('invoice_number_seq') AS n")).rows[0].n
    const number = invoiceNumber(Number(seq))

    const invoice = (
      await client.query(
        `INSERT INTO invoices (estimate_id, invoice_number, client_id, contact_name, title, summary, invoice_date, due_date,
                               currency, notes, subtotal, discount_type, discount_value, discount, total,
                               payment_terms, timeline, exclusions)
         VALUES ($1, $2, $3, $4, $5, $6, current_date, current_date + $7::int, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING id`,
        [
          estimateId, number, estimate.client_id, estimate.contact_name, estimate.title, estimate.summary,
          INVOICE_PAYMENT_TERM_DAYS, estimate.currency, estimate.notes, estimate.subtotal, estimate.discount_type,
          estimate.discount_value, estimate.discount, estimate.total,
          estimate.payment_terms, estimate.timeline, estimate.exclusions,
        ]
      )
    ).rows[0]

    // The invoice keeps its own copy of every line, so later changes never rewrite it
    await client.query(
      `INSERT INTO invoice_items (invoice_id, position, name, description, quantity, unit, unit_price)
       SELECT $1, position, name, description, quantity, unit, unit_price FROM estimate_items WHERE estimate_id = $2`,
      [invoice.id, estimateId]
    )

    let projectId: string
    if (estimate.project_id) {
      // Existing project (e.g. Pending): confirm it with the approved amount. Its time entries and labor cost are untouched.
      const linked = await client.query('SELECT id, source_estimate_id FROM projects WHERE id = $1 FOR UPDATE', [estimate.project_id])
      if (linked.rows.length === 0) throw new HttpError(400, 'The linked project no longer exists')
      if (linked.rows[0].source_estimate_id) throw new HttpError(400, 'The linked project already belongs to another estimate')
      await client.query(
        `UPDATE projects SET fee_status = 'confirmed', total_fee = $2, source_estimate_id = $3, source_invoice_id = $4 WHERE id = $1`,
        [estimate.project_id, estimate.total, estimateId, invoice.id]
      )
      projectId = estimate.project_id
    } else {
      const created = await client.query(
        `INSERT INTO projects (client_id, name, description, total_fee, fee_status, start_date, status, source_estimate_id, source_invoice_id)
         VALUES ($1, $2, $3, $4, 'confirmed', current_date, 'planning', $5, $6) RETURNING id`,
        [estimate.client_id, estimate.summary || estimate.title, estimate.summary, estimate.total, estimateId, invoice.id]
      )
      projectId = created.rows[0].id
    }

    await client.query(`UPDATE estimates SET status = 'approved', approved_at = now(), project_id = $2, updated_at = now() WHERE id = $1`, [
      estimateId,
      projectId,
    ])
    return { created: true }
  })
}

export function registerEstimateRoutes(app: Express) {
  app.get('/api/estimates', async (_req, res) => {
    try {
      // Approved estimates have become invoices, so they leave this list (they can still be opened by id)
      const result = await pool.query(
        `${ESTIMATE_SELECT} WHERE estimates.status <> 'approved' ORDER BY estimates.estimate_date DESC, estimates.id DESC`
      )
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch estimates')
    }
  })

  // Must come before /api/estimates/:estimateId
  app.get('/api/estimates/next-number', async (_req, res) => {
    try {
      res.json({ estimate_number: await nextEstimateNumber() })
    } catch (err) {
      sendError(res, err, 'Failed to generate an estimate number')
    }
  })

  app.get('/api/estimates/:estimateId', async (req, res) => {
    try {
      const estimate = await loadEstimate(requireId(req))
      if (!estimate) throw new HttpError(404, 'Estimate not found')
      res.json(estimate)
    } catch (err) {
      sendError(res, err, 'Failed to fetch estimate')
    }
  })

  app.post('/api/estimates', async (req, res) => {
    try {
      const body = { ...req.body }
      if (typeof body.estimate_number !== 'string' || !body.estimate_number.trim()) body.estimate_number = await nextEstimateNumber()
      const header = parseHeader(body)
      const items = parseItems(req.body.items)
      if (header.status === 'approved') throw new HttpError(400, 'Use the approve action to approve an estimate')
      computeTotals(items, header.discount_type as string, header.discount_value as number)

      const id = await withTransaction(async (client) => {
        await assertReferences(client, header.client_id, header.project_id)
        const inserted = await client.query(
          `INSERT INTO estimates (estimate_number, title, summary, client_id, contact_name, customer_ref, estimate_date,
                                  valid_until, currency, status, notes, discount_type, discount_value, project_id,
                                  payment_terms, timeline, exclusions)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
          [
            header.estimate_number, header.title, header.summary, header.client_id, header.contact_name, header.customer_ref,
            header.estimate_date, header.valid_until, header.currency, header.status, header.notes, header.discount_type,
            header.discount_value, header.project_id, header.payment_terms, header.timeline, header.exclusions,
          ]
        )
        await saveItemsAndTotals(client, inserted.rows[0].id, items, header.discount_type as string, header.discount_value as number)
        return inserted.rows[0].id
      })
      res.status(201).json(await loadEstimate(id))
    } catch (err) {
      sendError(res, err, 'Failed to create estimate', 'That estimate number is already used')
    }
  })

  app.put('/api/estimates/:estimateId', async (req, res) => {
    try {
      const id = requireId(req)
      const header = parseHeader(req.body)
      const items = parseItems(req.body.items)
      computeTotals(items, header.discount_type as string, header.discount_value as number)

      await withTransaction(async (client) => {
        const current = await client.query('SELECT status FROM estimates WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Estimate not found')
        // An approved estimate has produced an invoice and a project; editing it must not rewrite them
        if (current.rows[0].status === 'approved') {
          throw new HttpError(400, 'An approved estimate can no longer be edited')
        }
        if (header.status === 'approved') throw new HttpError(400, 'Use the approve action to approve an estimate')

        await assertReferences(client, header.client_id, header.project_id)
        await client.query(
          `UPDATE estimates SET estimate_number = $2, title = $3, summary = $4, client_id = $5, contact_name = $6,
                                customer_ref = $7, estimate_date = $8, valid_until = $9, currency = $10, status = $11,
                                notes = $12, discount_type = $13, discount_value = $14, project_id = $15,
                                payment_terms = $16, timeline = $17, exclusions = $18, updated_at = now()
           WHERE id = $1`,
          [
            id, header.estimate_number, header.title, header.summary, header.client_id, header.contact_name, header.customer_ref,
            header.estimate_date, header.valid_until, header.currency, header.status, header.notes, header.discount_type,
            header.discount_value, header.project_id, header.payment_terms, header.timeline, header.exclusions,
          ]
        )
        await saveItemsAndTotals(client, id, items, header.discount_type as string, header.discount_value as number)
      })
      res.json(await loadEstimate(id))
    } catch (err) {
      sendError(res, err, 'Failed to update estimate', 'That estimate number is already used')
    }
  })

  app.post('/api/estimates/:estimateId/approve', async (req, res) => {
    try {
      const id = requireId(req)
      const result = await approveEstimate(id)
      res.status(result.created ? 201 : 200).json({ ...(await loadEstimate(id)), already_approved: !result.created })
    } catch (err) {
      sendError(res, err, 'Failed to approve estimate')
    }
  })
}
