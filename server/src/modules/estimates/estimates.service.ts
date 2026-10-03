import type { PoolClient } from 'pg'
import { ESTIMATE_PREFIX, INVOICE_PAYMENT_TERM_DAYS, invoiceNumber } from '../../config'
import { lockForNumbering, pool, retryOnUniqueViolation, withTransaction } from '../../db'
import { HttpError, isIsoDate, roundMoney } from '../../shared'
import { DOCUMENT_LANGUAGES, isDocumentLanguage } from '../../shared/i18n/documentLabels'
import { loadClientSnapshot } from '../clients/clients.service'
import type { ClientSnapshot } from '../clients/clients.service'
import * as estimatesRepository from './estimates.repository'

export const ESTIMATE_STATUSES = ['draft', 'pending', 'approved', 'rejected']
export const UNITS = ['sqm', 'lm', 'ls', 'pc', 'm3', 'sheet']
export const PRICING_METHODS = ['itemized', 'lump_sum']
const DISCOUNT_TYPES = ['fixed', 'percent']
const MAX_ITEMS = 200

// The free-text "sections" that support **bold** formatting and "reuse previous text" (see documents.ts
// and the Estimate editor). Kept to an explicit allowlist since it is interpolated into SQL as a column name.
export const REUSE_TEXT_FIELDS = ['introduction', 'notes', 'payment_terms', 'timeline', 'exclusions'] as const

export type { ClientSnapshot }

async function assertProjectReference(db: { query: PoolClient['query'] }, organizationId: string, projectId: unknown) {
  if (!projectId) return
  const exists = await estimatesRepository.assertProjectExists(db, organizationId, projectId)
  if (!exists) throw new HttpError(400, 'Project does not exist')
}

export type ItemInput = { name: string; description: string | null; quantity: number; unit: string; unit_price: number }

// The single place quotation totals are calculated. The client only displays what this returns.
// Itemized: subtotal is the sum of the line amounts. Lump Sum: subtotal is only the lump sum fee -
// the line items still carry quantity/unit/unit_price internally, but none of that feeds the subtotal.
export function computeTotals(
  items: { quantity: number; unit_price: number }[],
  discountType: string,
  discountValue: number,
  pricingMethod: string = 'itemized',
  lumpSumFee: number = 0
) {
  const subtotal =
    pricingMethod === 'lump_sum'
      ? roundMoney(lumpSumFee)
      : roundMoney(items.reduce((sum, item) => sum + roundMoney(item.quantity * item.unit_price), 0))
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

// pricingMethod defaults to 'itemized' for callers (e.g. Client Funds invoices) that have no pricing method of their own.
export function parseItems(raw: unknown, pricingMethod: string = 'itemized'): ItemInput[] {
  if (!Array.isArray(raw)) return []
  if (raw.length > MAX_ITEMS) throw new HttpError(400, `An estimate can have at most ${MAX_ITEMS} items`)
  return raw.map((item, index) => {
    const row = `Item ${index + 1}`
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const quantity = item?.quantity
    const unit_price = item?.unit_price
    if (!name) throw new HttpError(400, `${row}: service name is required`)
    // Descriptions keep their line breaks exactly as typed
    const description = typeof item?.description === 'string' && item.description.trim() ? item.description : null

    if (pricingMethod === 'lump_sum') {
      // Quantity/unit/unit price aren't shown or required in Lump Sum mode. A row that already had valid
      // values (e.g. from before switching modes) keeps them untouched, so switching back to Itemized
      // restores them; a brand-new row created while in Lump Sum mode gets a harmless internal default.
      const validQuantity = typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0
      const validUnitPrice = typeof unit_price === 'number' && Number.isFinite(unit_price) && unit_price >= 0
      return {
        name,
        description,
        quantity: validQuantity ? quantity : 1,
        unit: UNITS.includes(item?.unit) ? item.unit : 'ls',
        unit_price: validUnitPrice ? unit_price : 0,
      }
    }

    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
      throw new HttpError(400, `${row}: quantity must be greater than 0`)
    }
    if (!UNITS.includes(item?.unit)) throw new HttpError(400, `${row}: unit must be one of ${UNITS.join(', ')}`)
    if (typeof unit_price !== 'number' || !Number.isFinite(unit_price) || unit_price < 0) {
      throw new HttpError(400, `${row}: unit price must be 0 or more`)
    }
    return { name, description, quantity, unit: item.unit, unit_price }
  })
}

export function parseHeader(body: Record<string, unknown>) {
  const estimate_number = typeof body.estimate_number === 'string' ? body.estimate_number.trim() : ''
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'USD'
  const status = body.status ?? 'draft'
  const estimate_date = body.estimate_date
  const valid_until = body.valid_until ? body.valid_until : null
  const discount_type = body.discount_type ?? 'fixed'
  const discount_value = body.discount_value ?? 0
  const pricing_method = body.pricing_method ?? 'itemized'
  const lump_sum_fee = body.lump_sum_fee ?? 0
  const document_language = body.document_language ?? 'en'

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
  if (typeof pricing_method !== 'string' || !PRICING_METHODS.includes(pricing_method)) {
    throw new HttpError(400, 'Pricing method must be itemized or lump_sum')
  }
  if (typeof lump_sum_fee !== 'number' || !Number.isFinite(lump_sum_fee) || lump_sum_fee < 0) {
    throw new HttpError(400, 'Lump sum fee must be 0 or more')
  }
  if (!isDocumentLanguage(document_language)) {
    throw new HttpError(400, 'Document language must be one of: ' + DOCUMENT_LANGUAGES.join(', '))
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
    pricing_method,
    // Stored to the same precision as every other money column
    lump_sum_fee: roundMoney(lump_sum_fee),
    document_language,
    project_id: body.project_id ? body.project_id : null,
    // Separate from the client's saved address, and from Summary/Notes/Terms
    project_location: optionalText(body.project_location),
    introduction: longText(body.introduction),
  }
}

export async function loadEstimate(organizationId: string, estimateId: string | number, db: { query: PoolClient['query'] } = pool) {
  const header = await estimatesRepository.selectEstimateHeaderById(organizationId, estimateId, db)
  if (!header) return null
  const items = await estimatesRepository.selectEstimateItemsByEstimateId(estimateId, db)
  return { ...header, items }
}

export async function listOpenEstimates(organizationId: string) {
  return estimatesRepository.selectOpenEstimates(organizationId)
}

export async function listReuseText(organizationId: string, field: string, search: string) {
  if (!(REUSE_TEXT_FIELDS as readonly string[]).includes(field)) {
    throw new HttpError(400, 'Unknown section: ' + field)
  }
  return estimatesRepository.selectReuseText(organizationId, field, search)
}

// Replaces all line items of an estimate and stores the backend-calculated totals
async function saveItemsAndTotals(
  client: PoolClient,
  estimateId: string | number,
  items: ItemInput[],
  discountType: string,
  discountValue: number,
  pricingMethod: string,
  lumpSumFee: number
) {
  const totals = computeTotals(items, discountType, discountValue, pricingMethod, lumpSumFee)
  await estimatesRepository.deleteEstimateItems(client, estimateId)
  for (const [index, item] of items.entries()) {
    await estimatesRepository.insertEstimateItem(client, estimateId, index, item)
  }
  await estimatesRepository.updateEstimateTotals(client, estimateId, totals)
}

// The next free estimate number (within this company): the highest trailing number in this company's
// existing estimate numbers, plus one.
export async function nextEstimateNumber(organizationId: string, db: { query: PoolClient['query'] } = pool): Promise<string> {
  const rows = await estimatesRepository.selectAllEstimateNumbers(organizationId, db)
  let highest = 0
  for (const row of rows) {
    const match = /(\d+)\s*$/.exec(row.estimate_number)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  let candidate = highest + 1
  // never suggest a number that is already taken
  for (;;) {
    const number = ESTIMATE_PREFIX + String(candidate).padStart(4, '0')
    const taken = await estimatesRepository.selectEstimateNumberTaken(organizationId, number, db)
    if (!taken) return number
    candidate++
  }
}

// The next free invoice number (within this company), used when an estimate is approved. Mirrors
// nextEstimateNumber() above - no shared, cross-company DB sequence to race on.
async function nextInvoiceNumber(organizationId: string, db: { query: PoolClient['query'] }): Promise<string> {
  const rows = await estimatesRepository.selectInvoiceNumbers(organizationId, db)
  let highest = 0
  for (const row of rows) {
    const match = /(\d+)\s*$/.exec(row.invoice_number)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  let candidate = highest + 1
  for (;;) {
    const number = invoiceNumber(candidate)
    const taken = await estimatesRepository.selectInvoiceNumberTaken(organizationId, number, db)
    if (!taken) return number
    candidate++
  }
}

// `autoNumber` is true when the caller didn't type their own estimate_number (the common case: the
// create form pre-fills a suggestion from nextEstimateNumber() and the admin just accepts it). In that
// case the number is finalized here, under a per-company lock, right before the insert - never trust a
// number computed earlier outside this transaction, since a second concurrent create could have taken
// it in between. A number the admin actually typed is used exactly as given; a collision on it is a
// real conflict and should fail normally, not be silently retried with a different number.
export async function createEstimate(organizationId: string, header: ReturnType<typeof parseHeader>, items: ItemInput[], autoNumber: boolean) {
  return retryOnUniqueViolation(
    () =>
      withTransaction(async (client) => {
        await assertProjectReference(client, organizationId, header.project_id)
        // A brand-new estimate always takes a fresh snapshot of the chosen client (if any)
        const snapshot = await loadClientSnapshot(client, organizationId, header.client_id)
        let finalHeader = header
        if (autoNumber) {
          await lockForNumbering(client, organizationId, 'estimate_number')
          finalHeader = { ...header, estimate_number: await nextEstimateNumber(organizationId, client) }
        }
        const id = await estimatesRepository.insertEstimate(client, organizationId, finalHeader, snapshot)
        await saveItemsAndTotals(
          client, id, items, finalHeader.discount_type as string, finalHeader.discount_value as number,
          finalHeader.pricing_method as string, finalHeader.lump_sum_fee as number
        )
        return id
      }),
    autoNumber ? 5 : 1
  )
}

export async function updateEstimateById(organizationId: string, id: string, header: ReturnType<typeof parseHeader>, items: ItemInput[]) {
  await withTransaction(async (client) => {
    const current = await estimatesRepository.selectCurrentEstimateForUpdate(client, organizationId, id)
    if (!current) throw new HttpError(404, 'Estimate not found')
    // An approved estimate has produced an invoice and a project; editing it must not rewrite them
    if (current.status === 'approved') {
      throw new HttpError(400, 'An approved estimate can no longer be edited')
    }
    if (header.status === 'approved') throw new HttpError(400, 'Use the approve action to approve an estimate')

    await assertProjectReference(client, organizationId, header.project_id)
    // Only a genuine change of client refreshes the snapshot; saving the same client again (e.g. after
    // editing items/discount) must not silently pull in whatever the client record looks like today.
    const clientChanged = String(current.client_id ?? '') !== String(header.client_id ?? '')
    const snapshot: ClientSnapshot = clientChanged
      ? await loadClientSnapshot(client, organizationId, header.client_id)
      : {
          client_name: current.client_name,
          client_email: current.client_email,
          client_phone: current.client_phone,
          client_address: current.client_address,
        }
    await estimatesRepository.updateEstimate(client, organizationId, id, header, snapshot)
    await saveItemsAndTotals(
      client, id, items, header.discount_type as string, header.discount_value as number,
      header.pricing_method as string, header.lump_sum_fee as number
    )
  })
}

// Approval creates the invoice and the project inside one transaction; it is safe to call repeatedly.
// The invoice number is always auto-generated, so a numbering collision here is always safe to retry.
export async function approveEstimate(organizationId: string, estimateId: string) {
  return retryOnUniqueViolation(
    () =>
      withTransaction(async (client) => {
        // Lock the row so two simultaneous approvals of THIS estimate run one after the other
        const locked = await estimatesRepository.lockEstimateForApproval(client, organizationId, estimateId)
        if (!locked) throw new HttpError(404, 'Estimate not found')

        const existing = await estimatesRepository.selectInvoiceIdForEstimate(client, estimateId)
        if (existing) {
          return { created: false }
        }
        if (locked.status === 'rejected') {
          throw new HttpError(400, 'A rejected estimate must be set back to Draft or Pending before it can be approved')
        }

        const estimate = await loadEstimate(organizationId, estimateId, client)
        if (!estimate.client_id) throw new HttpError(400, 'Choose a customer before approving')
        if (estimate.items.length === 0) throw new HttpError(400, 'Add at least one item before approving')

        const invoiceDate = await estimatesRepository.selectCurrentDate(client)
        // Two DIFFERENT estimates of the same company can be approved at the same moment, so the invoice
        // number - unlike the row lock above - needs its own per-company lock across all estimates.
        await lockForNumbering(client, organizationId, 'invoice_number')
        const number = await nextInvoiceNumber(organizationId, client)

        const invoice = await estimatesRepository.insertInvoiceFromEstimate(client, organizationId, estimateId, number, estimate, INVOICE_PAYMENT_TERM_DAYS)

        // The invoice keeps its own copy of every line, so later changes never rewrite it
        await estimatesRepository.copyEstimateItemsToInvoice(client, invoice.id, estimateId)

        let projectId: string
        if (estimate.project_id) {
          // Existing project (e.g. Pending): confirm it with the approved amount. Its time entries and labor cost are untouched.
          const linked = await estimatesRepository.lockProjectForApproval(client, organizationId, estimate.project_id)
          if (!linked) throw new HttpError(400, 'The linked project no longer exists')
          if (linked.source_estimate_id) throw new HttpError(400, 'The linked project already belongs to another estimate')
          await estimatesRepository.confirmExistingProjectForEstimate(client, estimate.project_id, estimate.total, estimateId, invoice.id, estimate.project_location)
          projectId = estimate.project_id
        } else {
          projectId = await estimatesRepository.insertProjectFromEstimate(client, organizationId, estimate, estimateId, invoice.id)
        }

        await estimatesRepository.markEstimateApproved(client, estimateId, projectId)
        return { created: true }
      }),
    5
  )
}

// A new, fully independent estimate that starts from another one's content: new id, new estimate
// number, Draft status, today's date. Copies the source's own client/pricing/items snapshot directly
// (never re-reads the Client master record), so it starts identical to what the source shows right now;
// the admin can then freely change the client, which refreshes the snapshot the normal way (see PUT above).
// Never copies: status, invoice/project links, approval time, or email history.
export async function duplicateEstimate(organizationId: string, estimateId: string) {
  return retryOnUniqueViolation(
    () =>
      withTransaction(async (client) => {
        const source = await loadEstimate(organizationId, estimateId, client)
        if (!source) throw new HttpError(404, 'Estimate not found')

        // The number is always auto-generated here (never typed by the admin), so it needs the same
        // per-company lock as createEstimate's auto-number path.
        await lockForNumbering(client, organizationId, 'estimate_number')
        const newNumber = await nextEstimateNumber(organizationId, client)
        const today = await estimatesRepository.selectCurrentDate(client)

        // Preserve the original validity duration (e.g. 14 days), not the original (possibly expired) dates
        let validUntil: string | null = null
        if (source.valid_until) {
          const durationDays = Math.round(
            (new Date(`${source.valid_until}T00:00:00Z`).getTime() - new Date(`${source.estimate_date}T00:00:00Z`).getTime()) / 86400000
          )
          validUntil = await estimatesRepository.selectDatePlusDays(client, durationDays)
        }

        const newId = await estimatesRepository.insertDuplicateEstimate(client, organizationId, newNumber, source, today, validUntil)

        for (const [index, item] of source.items.entries()) {
          await estimatesRepository.insertEstimateItem(client, newId, index, item)
        }

        const totals = computeTotals(
          source.items.map((item: { quantity: string; unit_price: string }) => ({ quantity: Number(item.quantity), unit_price: Number(item.unit_price) })),
          source.discount_type,
          Number(source.discount_value),
          source.pricing_method,
          Number(source.lump_sum_fee)
        )
        await estimatesRepository.updateEstimateTotals(client, newId, totals)

        return newId
      }),
    5
  )
}

// Permanently removes an estimate. Blocked (not cascaded) when an invoice or project already exists for
// it - those are important business records and must be removed deliberately (delete the project instead;
// that already removes its invoice and source estimate together, see DELETE /api/projects/:projectId).
export async function deleteEstimate(organizationId: string, id: string) {
  await withTransaction(async (client) => {
    const locked = await estimatesRepository.lockEstimateForDelete(client, organizationId, id)
    if (!locked) throw new HttpError(404, 'Estimate not found')

    const invoice = await estimatesRepository.selectInvoiceNumberForEstimate(client, id)
    if (invoice) {
      throw new HttpError(
        409,
        `This estimate was already converted to Invoice ${invoice.invoice_number} and cannot be deleted directly. Delete that invoice's project instead if you need to remove it entirely.`
      )
    }
    const project = await estimatesRepository.selectProjectNameForEstimate(client, id)
    if (project) {
      throw new HttpError(
        409,
        `This estimate created the project "${project.name}" and cannot be deleted directly. Delete that project instead if you need to remove it entirely.`
      )
    }

    // estimate_items and estimate_emails are removed automatically (ON DELETE CASCADE)
    await estimatesRepository.deleteEstimateById(client, id)
  })
}
