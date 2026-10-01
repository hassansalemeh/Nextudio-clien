import type { PoolClient } from 'pg'
import { clientFundsInvoiceNumber } from '../../config'
import { pool, withTransaction } from '../../db'
import { HttpError, isIsoDate, roundMoney } from '../../shared'
import { DOCUMENT_LANGUAGES, isDocumentLanguage } from '../../shared/i18n/documentLabels'
import { loadClientSnapshot } from '../clients/clients.service'
import type { ClientSnapshot } from '../clients/clients.service'
import { computeTotals, UNITS } from '../estimates/estimates.service'
import type { ItemInput } from '../estimates/estimates.service'
import * as invoicesRepository from './invoices.repository'

export function invoiceStatus(total: number, paid: number): 'unpaid' | 'partially_paid' | 'paid' {
  if (paid <= 0) return 'unpaid'
  return paid >= total ? 'paid' : 'partially_paid'
}

// Amount paid, amount due and status are always derived from the payment records
function withBalance<T extends { total: string; paid: string }>(row: T) {
  const total = Number(row.total)
  const paid = roundMoney(Number(row.paid))
  return { ...row, paid, amount_due: roundMoney(total - paid), status: invoiceStatus(total, paid) }
}

export async function listInvoices() {
  const rows = await invoicesRepository.selectInvoices()
  return rows.map(withBalance)
}

export async function loadInvoice(invoiceId: string | number) {
  const header = await invoicesRepository.selectInvoiceById(invoiceId)
  if (!header) return null
  const items = await invoicesRepository.selectInvoiceItems(invoiceId)
  const payments = await invoicesRepository.selectInvoicePayments(invoiceId)
  return { ...withBalance(header), items, payments }
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

export function parseItems(raw: unknown): ItemInput[] {
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

export function parseClientFundsHeader(body: Record<string, unknown>) {
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
  const row = await invoicesRepository.selectProjectForClientFunds(db, projectId)
  if (!row) throw new HttpError(400, 'Project does not exist')
  if (String(row.client_id) !== String(clientId)) {
    throw new HttpError(400, "That project does not belong to the selected client")
  }
  return row as { id: string; client_id: string; location: string | null }
}

export async function nextClientFundsInvoiceNumber(db: { query: PoolClient['query'] } = pool): Promise<string> {
  const seq = await invoicesRepository.selectNextClientFundsSequence(db)
  return clientFundsInvoiceNumber(Number(seq))
}

async function saveClientFundsItemsAndTotals(client: PoolClient, invoiceId: string | number, items: ItemInput[], discountType: string, discountValue: number) {
  const totals = computeTotals(items, discountType, discountValue)
  await invoicesRepository.deleteInvoiceItems(client, invoiceId)
  for (const [index, item] of items.entries()) {
    await invoicesRepository.insertInvoiceItem(client, invoiceId, index, item)
  }
  await invoicesRepository.updateInvoiceTotals(client, invoiceId, totals)
}

async function requireClientFundsInvoice(client: PoolClient, invoiceId: string) {
  const current = await invoicesRepository.selectInvoiceForUpdate(client, invoiceId)
  if (!current) throw new HttpError(404, 'Invoice not found')
  if (current.invoice_type !== 'client_funds') {
    throw new HttpError(400, 'Only a Client Funds invoice can be edited directly')
  }
  if (Number(current.paid) > 0) {
    throw new HttpError(400, 'This invoice already has a payment recorded and can no longer be edited')
  }
  return current as { client_id: string } & ClientSnapshot
}

// Creates a Client Funds invoice directly. Professional invoices are only ever created by approving an
// estimate (see the estimates module) - this refuses that type on purpose.
export async function createClientFundsInvoice(body: Record<string, unknown>) {
  if (body.invoice_type !== 'client_funds') {
    throw new HttpError(400, 'Only a Client Funds invoice can be created directly; approve an estimate for a Professional Services invoice')
  }
  const bodyWithNumber = { ...body }
  if (!bodyWithNumber.invoice_number || typeof bodyWithNumber.invoice_number !== 'string' || !bodyWithNumber.invoice_number.trim()) {
    bodyWithNumber.invoice_number = await nextClientFundsInvoiceNumber()
  }
  const header = parseClientFundsHeader(bodyWithNumber)
  const items = parseItems(body.items)
  computeTotals(items, header.discount_type as string, header.discount_value as number)

  return withTransaction(async (client) => {
    const project = await loadClientFundsProject(client, header.client_id, header.project_id)
    const projectLocation = header.project_location ?? project.location
    // Created directly (not from an estimate), so it takes a fresh snapshot of the client right now
    const snapshot = await loadClientSnapshot(client, header.client_id)
    const id = await invoicesRepository.insertClientFundsInvoice(client, header, projectLocation, snapshot)
    await saveClientFundsItemsAndTotals(client, id, items, header.discount_type as string, header.discount_value as number)
    return id
  })
}

export async function updateClientFundsInvoiceById(id: string, body: Record<string, unknown>) {
  const header = parseClientFundsHeader(body)
  const items = parseItems(body.items)
  computeTotals(items, header.discount_type as string, header.discount_value as number)

  await withTransaction(async (client) => {
    const current = await requireClientFundsInvoice(client, id)
    const project = await loadClientFundsProject(client, header.client_id, header.project_id)
    const projectLocation = header.project_location ?? project.location
    // Only a genuine change of client refreshes the snapshot; re-saving the same client keeps it frozen
    const clientChanged = String(current.client_id ?? '') !== String(header.client_id ?? '')
    const snapshot: ClientSnapshot = clientChanged ? await loadClientSnapshot(client, header.client_id) : current

    await invoicesRepository.updateClientFundsInvoice(client, id, header, projectLocation, snapshot)
    await saveClientFundsItemsAndTotals(client, id, items, header.discount_type as string, header.discount_value as number)
  })
}

// Narrow, Professional-Services-only operation: only the contract/signatures fields can change here.
// Every financial field, the items, and the dates stay exactly as they were frozen at approval.
export async function updateInvoiceContractById(id: string, body: Record<string, unknown>) {
  const contract_terms = longText(body.contract_terms)
  const client_representative_name = optionalText(body.client_representative_name)
  const client_representative_title = optionalText(body.client_representative_title)
  const nextudio_representative_name = optionalText(body.nextudio_representative_name)
  const nextudio_representative_title = optionalText(body.nextudio_representative_title)

  await withTransaction(async (client) => {
    const current = await invoicesRepository.selectInvoiceTypeForUpdate(client, id)
    if (!current) throw new HttpError(404, 'Invoice not found')
    if (current.invoice_type !== 'professional_services') {
      throw new HttpError(400, 'The Acceptance & Signatures contract only applies to a Professional Services invoice')
    }
    await invoicesRepository.updateInvoiceContract(client, id, {
      contract_terms,
      client_representative_name,
      client_representative_title,
      nextudio_representative_name,
      nextudio_representative_title,
    })
  })
}
