import type { Express, Request } from 'express'
import type { PoolClient } from 'pg'
import { clientFundsInvoiceNumber } from './config'
import { pool } from './db'
import { ClientSnapshot, computeTotals, ItemInput, loadClientSnapshot, UNITS } from './estimates'
import { HttpError, isIsoDate, roundMoney, sendError, withTransaction } from './http'
import { DOCUMENT_LANGUAGES, isDocumentLanguage } from './i18n/documentLabels'

export function invoiceStatus(total: number, paid: number): 'unpaid' | 'partially_paid' | 'paid' {
  if (paid <= 0) return 'unpaid'
  return paid >= total ? 'paid' : 'partially_paid'
}

const INVOICE_SELECT = `
  SELECT invoices.id, invoices.invoice_number, invoices.invoice_type, invoices.client_id,
         invoices.client_name, invoices.client_phone, invoices.client_email, invoices.client_address,
         invoices.contact_name, invoices.customer_ref, invoices.title, invoices.summary,
         to_char(invoices.invoice_date, 'YYYY-MM-DD') AS invoice_date,
         to_char(invoices.due_date, 'YYYY-MM-DD') AS due_date,
         invoices.currency, invoices.notes, invoices.payment_terms, invoices.timeline, invoices.exclusions,
         invoices.project_location, invoices.introduction, invoices.document_language,
         invoices.subtotal, invoices.discount_type, invoices.discount_value,
         invoices.discount, invoices.total, invoices.pricing_method, invoices.lump_sum_fee,
         -- Professional Services Invoice contract / Acceptance & Signatures - never set on a Client Funds invoice
         invoices.contract_terms, invoices.client_representative_name, invoices.client_representative_title,
         invoices.nextudio_representative_name, invoices.nextudio_representative_title,
         invoices.estimate_id, estimates.estimate_number,
         -- the forward link (both invoice types) falls back to the estimate-approval reverse link, for old rows
         coalesce(invoices.project_id, reverse_project.id) AS project_id,
         coalesce(fwd_project.name, reverse_project.name) AS project_name,
         coalesce((SELECT sum(amount) FROM payments WHERE payments.invoice_id = invoices.id), 0) AS paid
  FROM invoices
  LEFT JOIN estimates ON estimates.id = invoices.estimate_id
  LEFT JOIN projects fwd_project ON fwd_project.id = invoices.project_id
  LEFT JOIN projects reverse_project ON reverse_project.source_invoice_id = invoices.id`

// Amount paid, amount due and status are always derived from the payment records
function withBalance<T extends { total: string; paid: string }>(row: T) {
  const total = Number(row.total)
  const paid = roundMoney(Number(row.paid))
  return { ...row, paid, amount_due: roundMoney(total - paid), status: invoiceStatus(total, paid) }
}

export async function listInvoices() {
  const result = await pool.query(`${INVOICE_SELECT} ORDER BY invoices.invoice_date DESC, invoices.id DESC`)
  return result.rows.map(withBalance)
}

export async function loadInvoice(invoiceId: string | number) {
  const result = await pool.query(`${INVOICE_SELECT} WHERE invoices.id = $1`, [invoiceId])
  if (result.rows.length === 0) return null
  const items = await pool.query(
    `SELECT id, position, name, description, quantity, unit, unit_price, amount
     FROM invoice_items WHERE invoice_id = $1 ORDER BY position, id`,
    [invoiceId]
  )
  const payments = await pool.query(
    `SELECT id, to_char(payment_date, 'YYYY-MM-DD') AS payment_date, amount, reason, method, reference, created_at
     FROM payments WHERE invoice_id = $1 ORDER BY payment_date, id`,
    [invoiceId]
  )
  return { ...withBalance(result.rows[0]), items: items.rows, payments: payments.rows }
}

function requireId(req: Request) {
  const id = req.params.invoiceId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Invoice not found')
  return id
}

// ---- Client Funds invoices: created directly (no estimate behind them), unlike professional invoices ----

function longText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const MAX_ITEMS = 200
const DISCOUNT_TYPES = ['fixed', 'percent']

function parseItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw)) return []
  if (raw.length > MAX_ITEMS) throw new HttpError(400, `An invoice can have at most ${MAX_ITEMS} items`)
  return raw.map((item, index) => {
    const row = `Item ${index + 1}`
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const quantity = item?.quantity
    const unit_price = item?.unit_price
    if (!name) throw new HttpError(400, `${row}: description is required`)
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      throw new HttpError(400, `${row}: quantity must be greater than 0`)
    }
    if (!UNITS.includes(item?.unit)) throw new HttpError(400, `${row}: unit must be one of ${UNITS.join(', ')}`)
    if (typeof unit_price !== 'number' || !Number.isFinite(unit_price) || unit_price < 0) {
      throw new HttpError(400, `${row}: unit price must be 0 or more`)
    }
    const description = typeof item?.description === 'string' && item.description.trim() ? item.description : null
    return { name, description, quantity, unit: item.unit, unit_price }
  })
}

function parseClientFundsHeader(body: Record<string, unknown>) {
  const client_id = body.client_id
  const project_id = body.project_id
  const invoice_date = body.invoice_date
  const due_date = body.due_date ? body.due_date : null
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD'
  const discount_type = body.discount_type ?? 'fixed'
  const discount_value = body.discount_value ?? 0
  const document_language = body.document_language ?? 'en'

  if (!client_id || !/^\d+$/.test(String(client_id))) throw new HttpError(400, 'Choose a client')
  if (!project_id || !/^\d+$/.test(String(project_id))) throw new HttpError(400, 'Choose the project these funds are for')
  if (!isIsoDate(invoice_date)) throw new HttpError(400, 'Invoice date is required')
  if (due_date !== null && !isIsoDate(due_date)) throw new HttpError(400, 'Payment due date must be a valid date')
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'Currency must be a 3-letter code such as USD')
  if (typeof discount_type !== 'string' || !DISCOUNT_TYPES.includes(discount_type)) {
    throw new HttpError(400, 'Discount type must be fixed or percent')
  }
  if (typeof discount_value !== 'number' || !Number.isFinite(discount_value) || discount_value < 0) {
    throw new HttpError(400, 'Discount must be 0 or more')
  }
  if (!isDocumentLanguage(document_language)) {
    throw new HttpError(400, 'Document language must be one of: ' + DOCUMENT_LANGUAGES.join(', '))
  }

  return {
    client_id: String(client_id),
    project_id: String(project_id),
    invoice_number: typeof body.invoice_number === 'string' ? body.invoice_number.trim() : '',
    contact_name: optionalText(body.contact_name),
    customer_ref: optionalText(body.customer_ref),
    title: optionalText(body.title) ?? 'Client Funds / Project Expenses',
    summary: optionalText(body.summary),
    invoice_date,
    due_date,
    currency,
    notes: longText(body.notes),
    payment_terms: longText(body.payment_terms),
    timeline: longText(body.timeline),
    exclusions: longText(body.exclusions),
    discount_type,
    discount_value,
    document_language,
    project_location: optionalText(body.project_location),
    introduction: longText(body.introduction),
  }
}

// The project must exist and belong to the chosen client; its own location is used when none was typed in
async function loadClientFundsProject(db: { query: PoolClient['query'] }, clientId: string, projectId: string) {
  const result = await db.query('SELECT id, client_id, location FROM projects WHERE id = $1', [projectId])
  if (result.rows.length === 0) throw new HttpError(400, 'Project does not exist')
  if (String(result.rows[0].client_id) !== String(clientId)) {
    throw new HttpError(400, "That project does not belong to the selected client")
  }
  return result.rows[0] as { id: string; client_id: string; location: string | null }
}

async function nextClientFundsInvoiceNumber(db: { query: PoolClient['query'] } = pool): Promise<string> {
  const seq = (await db.query("SELECT nextval('client_funds_invoice_number_seq') AS n")).rows[0].n
  return clientFundsInvoiceNumber(Number(seq))
}

async function saveClientFundsItemsAndTotals(
  client: PoolClient,
  invoiceId: string | number,
  items: ItemInput[],
  discountType: string,
  discountValue: number
) {
  const totals = computeTotals(items, discountType, discountValue)
  await client.query('DELETE FROM invoice_items WHERE invoice_id = $1', [invoiceId])
  for (const [index, item] of items.entries()) {
    await client.query(
      `INSERT INTO invoice_items (invoice_id, position, name, description, quantity, unit, unit_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [invoiceId, index, item.name, item.description, item.quantity, item.unit, item.unit_price]
    )
  }
  await client.query('UPDATE invoices SET subtotal = $2, discount = $3, total = $4 WHERE id = $1', [
    invoiceId,
    totals.subtotal,
    totals.discount,
    totals.total,
  ])
}

async function requireClientFundsInvoice(client: PoolClient, invoiceId: string) {
  const current = await client.query(
    `SELECT invoices.invoice_type, invoices.client_id, invoices.client_name, invoices.client_email,
            invoices.client_phone, invoices.client_address,
            coalesce((SELECT sum(amount) FROM payments WHERE payments.invoice_id = invoices.id), 0) AS paid
     FROM invoices WHERE invoices.id = $1 FOR UPDATE`,
    [invoiceId]
  )
  if (current.rows.length === 0) throw new HttpError(404, 'Invoice not found')
  if (current.rows[0].invoice_type !== 'client_funds') {
    throw new HttpError(400, 'Only a Client Funds invoice can be edited directly')
  }
  if (Number(current.rows[0].paid) > 0) {
    throw new HttpError(400, 'This invoice already has a payment recorded and can no longer be edited')
  }
  return current.rows[0] as { client_id: string } & ClientSnapshot
}

export function registerInvoiceRoutes(app: Express) {
  app.get('/api/invoices', async (_req, res) => {
    try {
      res.json(await listInvoices())
    } catch (err) {
      sendError(res, err, 'Failed to fetch invoices')
    }
  })

  // Must come before /api/invoices/:invoiceId
  app.get('/api/invoices/next-number', async (req, res) => {
    try {
      if (req.query.type !== 'client_funds') throw new HttpError(400, 'Unsupported invoice type')
      res.json({ invoice_number: await nextClientFundsInvoiceNumber() })
    } catch (err) {
      sendError(res, err, 'Failed to generate an invoice number')
    }
  })

  app.get('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const invoice = await loadInvoice(requireId(req))
      if (!invoice) throw new HttpError(404, 'Invoice not found')
      res.json(invoice)
    } catch (err) {
      sendError(res, err, 'Failed to fetch invoice')
    }
  })

  // Creates a Client Funds invoice directly. Professional invoices are only ever created by approving an
  // estimate (see estimates.ts) - this route refuses that type on purpose.
  app.post('/api/invoices', async (req, res) => {
    try {
      if (req.body.invoice_type !== 'client_funds') {
        throw new HttpError(400, 'Only a Client Funds invoice can be created directly; approve an estimate for a Professional Services invoice')
      }
      const body = { ...req.body }
      if (!body.invoice_number || typeof body.invoice_number !== 'string' || !body.invoice_number.trim()) {
        body.invoice_number = await nextClientFundsInvoiceNumber()
      }
      const header = parseClientFundsHeader(body)
      const items = parseItems(req.body.items)
      computeTotals(items, header.discount_type as string, header.discount_value as number)

      const id = await withTransaction(async (client) => {
        const project = await loadClientFundsProject(client, header.client_id, header.project_id)
        const projectLocation = header.project_location ?? project.location
        // Created directly (not from an estimate), so it takes a fresh snapshot of the client right now
        const snapshot = await loadClientSnapshot(client, header.client_id)

        const inserted = await client.query(
          `INSERT INTO invoices (invoice_type, invoice_number, client_id, project_id, contact_name, customer_ref,
                                 title, summary, invoice_date, due_date, currency, notes, discount_type,
                                 discount_value, payment_terms, timeline, exclusions, project_location, introduction,
                                 document_language, client_name, client_email, client_phone, client_address,
                                 subtotal, discount, total)
           VALUES ('client_funds', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                   $19, $20, $21, $22, $23, 0, 0, 0)
           RETURNING id`,
          [
            header.invoice_number, header.client_id, header.project_id, header.contact_name, header.customer_ref,
            header.title, header.summary, header.invoice_date, header.due_date, header.currency, header.notes,
            header.discount_type, header.discount_value, header.payment_terms, header.timeline, header.exclusions,
            projectLocation, header.introduction, header.document_language,
            snapshot.client_name, snapshot.client_email, snapshot.client_phone, snapshot.client_address,
          ]
        )
        await saveClientFundsItemsAndTotals(client, inserted.rows[0].id, items, header.discount_type as string, header.discount_value as number)
        return inserted.rows[0].id
      })
      res.status(201).json(await loadInvoice(id))
    } catch (err) {
      sendError(res, err, 'Failed to create the invoice', 'That invoice number is already used')
    }
  })

  app.put('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const id = requireId(req)
      const header = parseClientFundsHeader(req.body)
      const items = parseItems(req.body.items)
      computeTotals(items, header.discount_type as string, header.discount_value as number)

      await withTransaction(async (client) => {
        const current = await requireClientFundsInvoice(client, id)
        const project = await loadClientFundsProject(client, header.client_id, header.project_id)
        const projectLocation = header.project_location ?? project.location
        // Only a genuine change of client refreshes the snapshot; re-saving the same client keeps it frozen
        const clientChanged = String(current.client_id ?? '') !== String(header.client_id ?? '')
        const snapshot: ClientSnapshot = clientChanged ? await loadClientSnapshot(client, header.client_id) : current

        await client.query(
          `UPDATE invoices SET invoice_number = $2, client_id = $3, project_id = $4, contact_name = $5,
                               customer_ref = $6, title = $7, summary = $8, invoice_date = $9, due_date = $10,
                               currency = $11, notes = $12, discount_type = $13, discount_value = $14,
                               payment_terms = $15, timeline = $16, exclusions = $17, project_location = $18,
                               introduction = $19, document_language = $20,
                               client_name = $21, client_email = $22, client_phone = $23, client_address = $24
           WHERE id = $1`,
          [
            id, header.invoice_number, header.client_id, header.project_id, header.contact_name, header.customer_ref,
            header.title, header.summary, header.invoice_date, header.due_date, header.currency, header.notes,
            header.discount_type, header.discount_value, header.payment_terms, header.timeline, header.exclusions,
            projectLocation, header.introduction, header.document_language,
            snapshot.client_name, snapshot.client_email, snapshot.client_phone, snapshot.client_address,
          ]
        )
        await saveClientFundsItemsAndTotals(client, id, items, header.discount_type as string, header.discount_value as number)
      })
      res.json(await loadInvoice(id))
    } catch (err) {
      sendError(res, err, 'Failed to update the invoice', 'That invoice number is already used')
    }
  })

  // Narrow, Professional-Services-only route: only the contract/signatures fields can change here.
  // Every financial field, the items, and the dates stay exactly as they were frozen at approval.
  app.put('/api/invoices/:invoiceId/contract', async (req, res) => {
    try {
      const id = requireId(req)
      const contract_terms = longText(req.body.contract_terms)
      const client_representative_name = optionalText(req.body.client_representative_name)
      const client_representative_title = optionalText(req.body.client_representative_title)
      const nextudio_representative_name = optionalText(req.body.nextudio_representative_name)
      const nextudio_representative_title = optionalText(req.body.nextudio_representative_title)

      await withTransaction(async (client) => {
        const current = await client.query('SELECT invoice_type FROM invoices WHERE id = $1 FOR UPDATE', [id])
        if (current.rows.length === 0) throw new HttpError(404, 'Invoice not found')
        if (current.rows[0].invoice_type !== 'professional_services') {
          throw new HttpError(400, 'The Acceptance & Signatures contract only applies to a Professional Services invoice')
        }
        await client.query(
          `UPDATE invoices SET contract_terms = $2, client_representative_name = $3, client_representative_title = $4,
                               nextudio_representative_name = $5, nextudio_representative_title = $6
           WHERE id = $1`,
          [id, contract_terms, client_representative_name, client_representative_title, nextudio_representative_name, nextudio_representative_title]
        )
      })
      res.json(await loadInvoice(id))
    } catch (err) {
      sendError(res, err, 'Failed to update the contract')
    }
  })
}
