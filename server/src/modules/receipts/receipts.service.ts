import type { PoolClient } from 'pg'
import { RECEIPT_PREFIX } from '../../config'
import { lockForNumbering, pool, retryOnUniqueViolation, withTransaction } from '../../db'
import { HttpError, isIsoDate, roundMoney } from '../../shared'
import { DOCUMENT_LANGUAGES, isDocumentLanguage } from '../../shared/i18n/documentLabels'
import { createPaymentWithinTransaction } from '../payments/payments.service'
import * as paymentsRepository from '../payments/payments.repository'
import * as signersRepository from '../signatures-and-stamps/document-signers.repository'
import * as receiptsRepository from './receipts.repository'

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parsePaymentIdInput(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const text = String(value)
  if (!/^\d+$/.test(text)) throw new HttpError(400, 'Invalid payment')
  return text
}

function parseSignerIdInput(value: unknown, label: string): string {
  if (value === undefined || value === null || value === '' || !/^\d+$/.test(String(value))) {
    throw new HttpError(400, `Choose ${label}`)
  }
  return String(value)
}

// The fields every receipt has regardless of whether it links to an existing payment or creates a new
// one. Money fields (amount/receipt_date/project_id/client_id) are handled separately by the caller,
// since where they come from depends on that choice. issued_by_signer_id/received_by_signer_id are
// resolved to an active signer's name by the caller, inside its own transaction (see createReceipt /
// updateReceiptById) - this function only checks that something that looks like an id was sent.
function parseReceiptFields(body: Record<string, unknown>) {
  const receipt_number = typeof body.receipt_number === 'string' ? body.receipt_number.trim() : ''
  const receiver_name = optionalText(body.receiver_name)
  const reason = optionalText(body.reason)
  const issued_by_signer_id = parseSignerIdInput(body.issued_by_signer_id, 'the issuing signer')
  const received_by_signer_id = parseSignerIdInput(body.received_by_signer_id, 'the receiving signer')
  // Checked by default: the client only has to opt out, not in
  const show_paid_stamp = body.show_paid_stamp !== false
  const show_company_stamp = body.show_company_stamp !== false
  const document_language = body.document_language ?? 'en'
  const payment_id = parsePaymentIdInput(body.payment_id)

  if (!receipt_number) throw new HttpError(400, 'Receipt number is required')
  if (!receiver_name) throw new HttpError(400, "Receiver's name is required")
  if (!reason) throw new HttpError(400, 'Reason for the payment is required')
  // Every new receipt's reason also becomes its payment's reason (see createReceipt), which caps at 200 -
  // enforced here too so a long reason fails clearly instead of surfacing as a payment validation error.
  if (reason.length > 200) throw new HttpError(400, 'The reason is too long (200 characters at most)')
  if (!isDocumentLanguage(document_language)) {
    throw new HttpError(400, 'Document language must be one of: ' + DOCUMENT_LANGUAGES.join(', '))
  }

  return {
    receipt_number,
    receiver_name,
    receiver_email: optionalText(body.receiver_email),
    reason,
    issued_by_signer_id,
    received_by_signer_id,
    show_paid_stamp,
    show_company_stamp,
    document_language,
    payment_id,
  }
}

// Resolves a signer id to its current display_name, and fails unless that signer is active and belongs
// to this organization (the DB's composite FK also guarantees "same organization" at insert/update time,
// but "active" can only be checked here - is_active is a mutable flag, not something a FK can enforce).
async function resolveActiveSignerName(client: PoolClient, organizationId: string, signerId: string, label: string): Promise<string> {
  const name = await signersRepository.selectSignerNameIfActive(client, organizationId, signerId)
  if (!name) throw new HttpError(400, `Choose an active ${label}`)
  return name
}

// Only for a brand-new receipt that is NOT linking to an existing payment: a project is required,
// because these fields become the new payment's own project_id/payment_date/amount.
function parseNewReceiptPaymentFields(body: Record<string, unknown>) {
  const project_id = body.project_id
  const receipt_date = body.receipt_date
  const amount = body.amount

  if (project_id === undefined || project_id === null || project_id === '' || !/^\d+$/.test(String(project_id))) {
    throw new HttpError(400, 'Choose a project')
  }
  if (!isIsoDate(receipt_date)) throw new HttpError(400, 'Receipt date is required')
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Amount must be greater than 0')

  return { project_id: String(project_id), receipt_date: receipt_date as string, amount: roundMoney(amount) }
}

// Only for updating the one receipt that predates payment-linking (payment_id is null): keeps the
// original, fully optional-project validation so that grandfathered row isn't forced to gain one.
function parseUnlinkedReceiptMoneyFields(body: Record<string, unknown>) {
  const receipt_date = body.receipt_date
  const amount = body.amount

  if (!isIsoDate(receipt_date)) throw new HttpError(400, 'Receipt date is required')
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Amount must be greater than 0')

  return {
    receipt_date: receipt_date as string,
    amount: roundMoney(amount),
    client_id: body.client_id ? String(body.client_id) : null,
    project_id: body.project_id ? String(body.project_id) : null,
  }
}

export async function listReceipts(organizationId: string) {
  return receiptsRepository.selectReceipts(organizationId)
}

export async function loadReceipt(organizationId: string, id: string | number, db: { query: PoolClient['query'] } = pool) {
  return receiptsRepository.selectReceiptById(organizationId, id, db)
}

// The next free receipt number (within this company): the highest trailing number in this company's
// existing receipt numbers, plus one. Mirrors nextEstimateNumber() - no shared, cross-company DB sequence to race on.
export async function nextReceiptNumber(organizationId: string, db: { query: PoolClient['query'] } = pool): Promise<string> {
  const rows = await receiptsRepository.selectAllReceiptNumbers(organizationId, db)
  let highest = 0
  for (const row of rows) {
    const match = /(\d+)\s*$/.exec(row.receipt_number)
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  let candidate = highest + 1
  for (;;) {
    const number = RECEIPT_PREFIX + String(candidate).padStart(4, '0')
    const taken = await receiptsRepository.selectReceiptNumberTaken(organizationId, number, db)
    if (!taken) return number
    candidate++
  }
}

// Every new receipt links to exactly one payment: either an existing, receipt-less one (header.payment_id
// set - the "Create receipt" action on the Payments page), or a brand-new one created in this same
// transaction (the Receipts page's "New Receipt", which requires a project). Either way, amount/
// receipt_date/project_id/client_id come from that payment - never from the request body directly.
export async function createReceipt(organizationId: string, body: Record<string, unknown>, autoNumber: boolean) {
  const fields = parseReceiptFields(body)
  return retryOnUniqueViolation(
    () =>
      withTransaction(async (client) => {
        let moneyFields: { receipt_date: string; amount: number; project_id: string | null; client_id: string | null }
        let payment_id: string

        if (fields.payment_id) {
          const payment = await receiptsRepository.lockPaymentForLinking(client, organizationId, fields.payment_id)
          if (!payment) throw new HttpError(400, 'Payment not found')
          if (payment.cancelled_at) throw new HttpError(400, 'This payment is cancelled and cannot get a receipt')
          const alreadyLinked = await receiptsRepository.selectReceiptForPayment(client, fields.payment_id)
          if (alreadyLinked) throw new HttpError(400, `This payment already has receipt ${alreadyLinked.receipt_number}`)
          moneyFields = {
            receipt_date: payment.payment_date,
            amount: Number(payment.amount),
            project_id: payment.project_id,
            client_id: payment.client_id,
          }
          payment_id = fields.payment_id
        } else {
          const newPaymentFields = parseNewReceiptPaymentFields(body)
          const client_id = await receiptsRepository.selectClientIdForProject(client, organizationId, newPaymentFields.project_id)
          if (client_id === null) throw new HttpError(400, 'Project does not exist')
          payment_id = await createPaymentWithinTransaction(client, organizationId, {
            project_id: newPaymentFields.project_id,
            invoice_id: null,
            payment_date: newPaymentFields.receipt_date,
            amount: newPaymentFields.amount,
            reason: fields.reason,
            method: null,
            reference: null,
          })
          moneyFields = { receipt_date: newPaymentFields.receipt_date, amount: newPaymentFields.amount, project_id: newPaymentFields.project_id, client_id }
        }

        const issuedByName = await resolveActiveSignerName(client, organizationId, fields.issued_by_signer_id, 'issuing signer')
        const receivedByName = await resolveActiveSignerName(client, organizationId, fields.received_by_signer_id, 'receiving signer')

        let receipt_number = fields.receipt_number
        if (autoNumber) {
          await lockForNumbering(client, organizationId, 'receipt_number')
          receipt_number = await nextReceiptNumber(organizationId, client)
        }

        return receiptsRepository.insertReceipt(client, organizationId, {
          receipt_number,
          receipt_date: moneyFields.receipt_date,
          client_id: moneyFields.client_id,
          project_id: moneyFields.project_id,
          receiver_name: fields.receiver_name,
          receiver_email: fields.receiver_email,
          amount: moneyFields.amount,
          currency: 'USD',
          reason: fields.reason,
          issued_by_admin: issuedByName,
          issued_by_signer_id: fields.issued_by_signer_id,
          received_by_admin: receivedByName,
          received_by_signer_id: fields.received_by_signer_id,
          show_paid_stamp: fields.show_paid_stamp,
          show_company_stamp: fields.show_company_stamp,
          document_language: fields.document_language,
          payment_id,
        })
      }),
    autoNumber ? 5 : 1
  )
}

// A linked receipt's amount/date/project can't be changed here - they come from the payment, and the
// payment itself can't be corrected while this receipt exists (see payments.service.correctPayment).
// Every other field (receiver name/email, reason, issuing admin, language) stays freely editable.
export async function updateReceiptById(organizationId: string, id: string, body: Record<string, unknown>) {
  const fields = parseReceiptFields(body)
  if (fields.payment_id) throw new HttpError(400, "A receipt's linked payment can't be changed")

  await withTransaction(async (client) => {
    const existing = await receiptsRepository.lockReceiptForUpdate(client, organizationId, id)
    if (!existing) throw new HttpError(404, 'Receipt not found')
    if (existing.cancelled_at) throw new HttpError(400, 'This receipt is cancelled and can no longer be edited')

    let moneyFields: { receipt_date: string; amount: number; project_id: string | null; client_id: string | null }

    if (existing.payment_id) {
      const existingAmount = Number(existing.amount)
      const amountChanged = 'amount' in body && (typeof body.amount !== 'number' || roundMoney(body.amount) !== existingAmount)
      const dateChanged = 'receipt_date' in body && body.receipt_date !== existing.receipt_date
      const projectChanged = 'project_id' in body && String(body.project_id ?? '') !== String(existing.project_id ?? '')
      if (amountChanged || dateChanged || projectChanged) {
        throw new HttpError(400, 'Amount, date and project come from the linked payment. Correct the payment to change them.')
      }
      moneyFields = { receipt_date: existing.receipt_date, amount: existingAmount, project_id: existing.project_id, client_id: existing.client_id }
    } else {
      const legacy = parseUnlinkedReceiptMoneyFields(body)
      if (!(await receiptsRepository.assertClientExists(client, organizationId, legacy.client_id))) {
        throw new HttpError(400, 'Client does not exist')
      }
      if (!(await receiptsRepository.assertProjectExists(client, organizationId, legacy.project_id))) {
        throw new HttpError(400, 'Project does not exist')
      }
      moneyFields = legacy
    }

    const issuedByName = await resolveActiveSignerName(client, organizationId, fields.issued_by_signer_id, 'issuing signer')
    const receivedByName = await resolveActiveSignerName(client, organizationId, fields.received_by_signer_id, 'receiving signer')

    await receiptsRepository.updateReceipt(client, organizationId, id, {
      receipt_number: fields.receipt_number,
      receipt_date: moneyFields.receipt_date,
      client_id: moneyFields.client_id,
      project_id: moneyFields.project_id,
      receiver_name: fields.receiver_name,
      receiver_email: fields.receiver_email,
      amount: moneyFields.amount,
      currency: 'USD',
      reason: fields.reason,
      issued_by_admin: issuedByName,
      issued_by_signer_id: fields.issued_by_signer_id,
      received_by_admin: receivedByName,
      received_by_signer_id: fields.received_by_signer_id,
      show_paid_stamp: fields.show_paid_stamp,
      show_company_stamp: fields.show_company_stamp,
      document_language: fields.document_language,
      payment_id: existing.payment_id,
    })
  })
}

// Cancels a receipt and, if it has one, its linked payment - together, in the same transaction. This is
// the only way to cancel a payment that has an active receipt (payments.service.cancelPayment refuses
// that; it's only for a payment without one).
export async function cancelReceipt(organizationId: string, id: string, reason: string, cancelledBy: string) {
  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new HttpError(400, 'A reason is required to cancel a receipt')
  if (trimmedReason.length > 500) throw new HttpError(400, 'The reason is too long (500 characters at most)')

  await withTransaction(async (client) => {
    const receipt = await receiptsRepository.lockReceiptForCancel(client, organizationId, id)
    if (!receipt) throw new HttpError(404, 'Receipt not found')
    if (receipt.cancelled_at) throw new HttpError(400, 'This receipt is already cancelled')

    await receiptsRepository.updateReceiptCancelled(client, id, cancelledBy, trimmedReason)
    if (receipt.payment_id) {
      await paymentsRepository.updatePaymentCancelled(client, receipt.payment_id, cancelledBy, trimmedReason)
    }
  })
}
