import type { PoolClient } from 'pg'
import type { z } from 'zod'
import { clientFundsInvoiceNumber } from '../../config'
import { lockForNumbering, pool, retryOnUniqueViolation, withTransaction } from '../../db'
import { HttpError, roundMoney } from '../../shared'
import { loadClientSnapshot } from '../clients/clients.service'
import type { ClientSnapshot } from '../clients/clients.service'
import { computeTotals } from '../estimates/estimates.service'
import type { ItemInput } from '../estimates/estimates.service'
import type { createClientFundsInvoiceBody, updateInvoiceContractBody } from './invoices.schemas'
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

export async function listInvoices(organizationId: string) {
  const rows = await invoicesRepository.selectInvoices(organizationId)
  return rows.map(withBalance)
}

export async function loadInvoice(organizationId: string, invoiceId: string | number) {
  const header = await invoicesRepository.selectInvoiceById(organizationId, invoiceId)
  if (!header) return null
  const items = await invoicesRepository.selectInvoiceItems(invoiceId)
  const payments = await invoicesRepository.selectInvoicePayments(invoiceId)
  return { ...withBalance(header), items, payments }
}

// ---- Client Funds invoices: created directly (no estimate behind them), unlike professional invoices ----

type ClientFundsHeader = Omit<z.infer<typeof createClientFundsInvoiceBody>, 'invoice_number'> & { invoice_number: string }

// The project must exist and belong to the chosen client (and to this company); its own location is used when none was typed in
async function loadClientFundsProject(db: { query: PoolClient['query'] }, organizationId: string, clientId: string, projectId: string) {
  const row = await invoicesRepository.selectProjectForClientFunds(db, organizationId, projectId)
  if (!row) throw new HttpError(400, 'Project does not exist')
  if (String(row.client_id) !== String(clientId)) {
    throw new HttpError(400, "That project does not belong to the selected client")
  }
  return row as { id: string; client_id: string; location: string | null }
}

// Per-company numbering: the highest trailing number already used by this company, plus one. Mirrors
// estimates.service's nextEstimateNumber() - there is no shared, cross-company DB sequence to race on.
export async function nextClientFundsInvoiceNumber(organizationId: string, db: { query: PoolClient['query'] } = pool): Promise<string> {
  const rows = await invoicesRepository.selectClientFundsInvoiceNumbers(organizationId, db)
  let highest = 0
  for (const row of rows) {
    const match = /(\d+)\s*$/.exec(row.invoice_number)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  let candidate = highest + 1
  for (;;) {
    const number = clientFundsInvoiceNumber(candidate)
    const taken = await invoicesRepository.selectClientFundsInvoiceNumberTaken(organizationId, number, db)
    if (!taken) return number
    candidate++
  }
}

async function saveClientFundsItemsAndTotals(client: PoolClient, invoiceId: string | number, items: ItemInput[], discountType: string, discountValue: number) {
  const totals = computeTotals(items, discountType, discountValue)
  await invoicesRepository.deleteInvoiceItems(client, invoiceId)
  for (const [index, item] of items.entries()) {
    await invoicesRepository.insertInvoiceItem(client, invoiceId, index, item)
  }
  await invoicesRepository.updateInvoiceTotals(client, invoiceId, totals)
}

async function requireClientFundsInvoice(client: PoolClient, organizationId: string, invoiceId: string) {
  const current = await invoicesRepository.selectInvoiceForUpdate(client, organizationId, invoiceId)
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
// estimate (see the estimates module) - this refuses that type on purpose (see createClientFundsInvoiceBody).
export async function createClientFundsInvoice(organizationId: string, body: z.infer<typeof createClientFundsInvoiceBody>) {
  // true when the caller didn't type their own invoice_number (the create form pre-fills a suggestion
  // from nextClientFundsInvoiceNumber() and the admin usually just accepts it).
  const autoNumber = body.invoice_number === null
  const header: ClientFundsHeader = {
    ...body,
    // Only a placeholder for the insert below - the real number is computed again under a lock, right
    // before the insert: a number computed here, before the transaction even starts, could be taken by a
    // concurrent create before we get there.
    invoice_number: autoNumber ? await nextClientFundsInvoiceNumber(organizationId) : (body.invoice_number as string),
  }
  const items: ItemInput[] = body.items
  computeTotals(items, header.discount_type, header.discount_value)

  return retryOnUniqueViolation(
    () =>
      withTransaction(async (client) => {
        const project = await loadClientFundsProject(client, organizationId, header.client_id, header.project_id)
        const projectLocation = header.project_location ?? project.location
        // Created directly (not from an estimate), so it takes a fresh snapshot of the client right now
        const snapshot = await loadClientSnapshot(client, organizationId, header.client_id)
        let finalHeader = header
        if (autoNumber) {
          await lockForNumbering(client, organizationId, 'client_funds_invoice_number')
          finalHeader = { ...header, invoice_number: await nextClientFundsInvoiceNumber(organizationId, client) }
        }
        const id = await invoicesRepository.insertClientFundsInvoice(client, organizationId, finalHeader, projectLocation, snapshot)
        await saveClientFundsItemsAndTotals(client, id, items, finalHeader.discount_type, finalHeader.discount_value)
        return id
      }),
    autoNumber ? 5 : 1
  )
}

export async function updateClientFundsInvoiceById(organizationId: string, id: string, body: ClientFundsHeader & { items: ItemInput[] }) {
  const { items, ...header } = body
  computeTotals(items, header.discount_type, header.discount_value)

  await withTransaction(async (client) => {
    const current = await requireClientFundsInvoice(client, organizationId, id)
    const project = await loadClientFundsProject(client, organizationId, header.client_id, header.project_id)
    const projectLocation = header.project_location ?? project.location
    // Only a genuine change of client refreshes the snapshot; re-saving the same client keeps it frozen
    const clientChanged = String(current.client_id ?? '') !== String(header.client_id ?? '')
    const snapshot: ClientSnapshot = clientChanged ? await loadClientSnapshot(client, organizationId, header.client_id) : current

    await invoicesRepository.updateClientFundsInvoice(client, organizationId, id, header, projectLocation, snapshot)
    await saveClientFundsItemsAndTotals(client, id, items, header.discount_type, header.discount_value)
  })
}

// Narrow, Professional-Services-only operation: only the contract/signatures fields can change here.
// Every financial field, the items, and the dates stay exactly as they were frozen at approval.
export async function updateInvoiceContractById(organizationId: string, id: string, body: z.infer<typeof updateInvoiceContractBody>) {
  await withTransaction(async (client) => {
    const current = await invoicesRepository.selectInvoiceTypeForUpdate(client, organizationId, id)
    if (!current) throw new HttpError(404, 'Invoice not found')
    if (current.invoice_type !== 'professional_services') {
      throw new HttpError(400, 'The Acceptance & Signatures contract only applies to a Professional Services invoice')
    }
    await invoicesRepository.updateInvoiceContract(client, organizationId, id, body)
  })
}
