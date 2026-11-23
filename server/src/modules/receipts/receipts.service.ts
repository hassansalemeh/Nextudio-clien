import type { PoolClient } from 'pg'
import type { z } from 'zod'
import { RECEIPT_PREFIX } from '../../config'
import { lockForNumbering, pool, retryOnUniqueViolation, withTransaction } from '../../db'
import { HttpError, roundMoney } from '../../shared'
import { createPaymentWithinTransaction } from '../payments/payments.service'
import * as paymentsRepository from '../payments/payments.repository'
import * as signersRepository from '../signatures-and-stamps/document-signers.repository'
import type { createReceiptBody } from './receipts.schemas'
import * as receiptsRepository from './receipts.repository'

type ReceiptInput = Omit<z.infer<typeof createReceiptBody>, 'receipt_number'> & { receipt_number: string }

// Resolves a signer id to its current display_name, and fails unless that signer is active and belongs
// to this organization (the DB's composite FK also guarantees "same organization" at insert/update time,
// but "active" can only be checked here - is_active is a mutable flag, not something a FK can enforce).
async function resolveActiveSignerName(client: PoolClient, organizationId: string, signerId: string, label: string): Promise<string> {
  const name = await signersRepository.selectSignerNameIfActive(client, organizationId, signerId)
  if (!name) throw new HttpError(400, `Choose an active ${label}`)
  return name
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

// Every new receipt links to exactly one payment: either an existing, receipt-less one (fields.payment_id
// set - the "Create receipt" action on the Payments page), or a brand-new one created in this same
// transaction (the Receipts page's "New Receipt", which requires a project). Either way, amount/
// receipt_date/project_id/client_id come from that payment - never from the request body directly.
export async function createReceipt(organizationId: string, fields: ReceiptInput, autoNumber: boolean) {
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
          // Only for a brand-new receipt that is NOT linking to an existing payment: a project is required,
          // because these fields become the new payment's own project_id/payment_date/amount.
          if (!fields.project_id) throw new HttpError(400, 'Choose a project')
          const client_id = await receiptsRepository.selectClientIdForProject(client, organizationId, fields.project_id)
          if (client_id === null) throw new HttpError(400, 'Project does not exist')
          const amount = roundMoney(fields.amount)
          payment_id = await createPaymentWithinTransaction(client, organizationId, {
            project_id: fields.project_id,
            invoice_id: null,
            payment_date: fields.receipt_date,
            amount,
            reason: fields.reason,
            method: null,
            reference: null,
          })
          moneyFields = { receipt_date: fields.receipt_date, amount, project_id: fields.project_id, client_id }
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
export async function updateReceiptById(organizationId: string, id: string, fields: ReceiptInput) {
  await withTransaction(async (client) => {
    const existing = await receiptsRepository.lockReceiptForUpdate(client, organizationId, id)
    if (!existing) throw new HttpError(404, 'Receipt not found')
    if (existing.cancelled_at) throw new HttpError(400, 'This receipt is cancelled and can no longer be edited')
    if (fields.payment_id && fields.payment_id !== String(existing.payment_id ?? '')) {
      throw new HttpError(400, "A receipt's linked payment can't be changed")
    }

    let moneyFields: { receipt_date: string; amount: number; project_id: string | null; client_id: string | null }

    if (existing.payment_id) {
      const existingAmount = Number(existing.amount)
      const amountChanged = roundMoney(fields.amount) !== existingAmount
      const dateChanged = fields.receipt_date !== existing.receipt_date
      const projectChanged = String(fields.project_id ?? '') !== String(existing.project_id ?? '')
      if (amountChanged || dateChanged || projectChanged) {
        throw new HttpError(400, 'Amount, date and project come from the linked payment. Correct the payment to change them.')
      }
      moneyFields = { receipt_date: existing.receipt_date, amount: existingAmount, project_id: existing.project_id, client_id: existing.client_id }
    } else {
      // Only for updating the one receipt that predates payment-linking (payment_id is null): keeps the
      // original, fully optional-project validation so that grandfathered row isn't forced to gain one.
      if (!(await receiptsRepository.assertClientExists(client, organizationId, fields.client_id))) {
        throw new HttpError(400, 'Client does not exist')
      }
      if (!(await receiptsRepository.assertProjectExists(client, organizationId, fields.project_id))) {
        throw new HttpError(400, 'Project does not exist')
      }
      moneyFields = { receipt_date: fields.receipt_date, amount: roundMoney(fields.amount), client_id: fields.client_id, project_id: fields.project_id }
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
  await withTransaction(async (client) => {
    const receipt = await receiptsRepository.lockReceiptForCancel(client, organizationId, id)
    if (!receipt) throw new HttpError(404, 'Receipt not found')
    if (receipt.cancelled_at) throw new HttpError(400, 'This receipt is already cancelled')

    await receiptsRepository.updateReceiptCancelled(client, id, cancelledBy, reason)
    if (receipt.payment_id) {
      await paymentsRepository.updatePaymentCancelled(client, receipt.payment_id, cancelledBy, reason)
    }
  })
}
