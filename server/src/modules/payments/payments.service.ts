import type { PoolClient } from 'pg'
import type { z } from 'zod'
import { withTransaction } from '../../db'
import { HttpError, roundMoney } from '../../shared'
import type { paymentBody } from './payments.schemas'
import * as paymentsRepository from './payments.repository'

// The only place payments are created or changed. A payment is money received from a client:
// it always belongs to a project and may also be applied to that project's invoice.
// Invoice paid/due, the project's payments, and the dashboard all sum this one table.

type PaymentInput = z.infer<typeof paymentBody>

// Validates a payment against the project and (if applied to one) its invoice. `paymentId` excludes a payment from
// its own invoice total when it is being corrected.
async function checkPayment(client: PoolClient, organizationId: string, input: PaymentInput, paymentId: string | null) {
  const projectExists = await paymentsRepository.selectProjectExists(client, organizationId, input.project_id)
  if (!projectExists) throw new HttpError(400, 'Project does not exist')

  // a payment date can't be in the future (a day of tolerance for time zones)
  const dateOk = await paymentsRepository.selectPaymentDateNotInFuture(client, input.payment_date)
  if (!dateOk) throw new HttpError(400, 'The payment date cannot be in the future')

  if (input.invoice_id !== null) {
    // the invoice must be this project's own invoice; lock it so simultaneous payments can't both pass
    const invoice = await paymentsRepository.selectInvoiceForPaymentCheck(client, organizationId, input.invoice_id, input.project_id)
    if (!invoice) throw new HttpError(400, 'That invoice does not belong to this project')

    const othersPaid = await paymentsRepository.selectOtherPaymentsTotalForInvoice(client, input.invoice_id, paymentId)
    const due = roundMoney(Number(invoice.total) - Number(othersPaid))
    if (input.amount > due) {
      throw new HttpError(400, `This payment is more than the amount due on the invoice (${due.toFixed(2)})`)
    }
  }
}

export async function loadPayment(organizationId: string, id: string | number) {
  return paymentsRepository.selectPaymentById(organizationId, id)
}

export async function listPayments(organizationId: string, projectId: string | null) {
  return paymentsRepository.selectPayments(organizationId, projectId)
}

// The create logic, usable inside a transaction the caller already holds - receipts.service uses this
// to create a receipt's payment in the same transaction as the receipt itself.
export async function createPaymentWithinTransaction(client: PoolClient, organizationId: string, body: PaymentInput) {
  const input = { ...body, amount: roundMoney(body.amount) }
  await checkPayment(client, organizationId, input, null)
  return paymentsRepository.insertPayment(client, organizationId, input)
}

export async function createPayment(organizationId: string, body: PaymentInput) {
  return withTransaction((client) => createPaymentWithinTransaction(client, organizationId, body))
}

// A correction: what the payment looked like before is kept in payment_revisions. Payments are never deleted.
export async function correctPayment(organizationId: string, id: string, body: PaymentInput) {
  const input = { ...body, amount: roundMoney(body.amount) }
  await withTransaction(async (client) => {
    const current = await paymentsRepository.selectPaymentRowForUpdate(client, organizationId, id)
    if (!current) throw new HttpError(404, 'Payment not found')
    if (current.row.cancelled_at) throw new HttpError(400, 'This payment is cancelled and can no longer be corrected')
    // An issued receipt must never change silently - the receipt has to be cancelled first.
    const receipt = await paymentsRepository.selectActiveReceiptForPayment(client, id)
    if (receipt) throw new HttpError(400, `This payment has receipt ${receipt.receipt_number}. Cancel the receipt to correct it.`)
    await checkPayment(client, organizationId, input, id)
    await paymentsRepository.insertPaymentRevision(client, id, current.row)
    await paymentsRepository.updatePayment(client, organizationId, id, input)
  })
}

// Cancelling a payment WITHOUT a receipt - a payment that has one can only be cancelled by cancelling
// the receipt (receipts.service.cancelReceipt), which cancels this payment along with it.
export async function cancelPayment(organizationId: string, id: string, reason: string, cancelledBy: string) {
  await withTransaction(async (client) => {
    const payment = await paymentsRepository.lockPaymentForCancel(client, organizationId, id)
    if (!payment) throw new HttpError(404, 'Payment not found')
    if (payment.cancelled_at) throw new HttpError(400, 'This payment is already cancelled')
    const receipt = await paymentsRepository.selectActiveReceiptForPayment(client, id)
    if (receipt) throw new HttpError(400, `This payment has receipt ${receipt.receipt_number}. Cancel the receipt instead.`)
    await paymentsRepository.updatePaymentCancelled(client, id, cancelledBy, reason)
  })
}
