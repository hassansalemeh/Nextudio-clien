import type { PoolClient } from 'pg'
import { withTransaction } from '../../db'
import { HttpError, isIsoDate, roundMoney } from '../../shared'
import * as paymentsRepository from './payments.repository'

// The only place payments are created or changed. A payment is money received from a client:
// it always belongs to a project and may also be applied to that project's invoice.
// Invoice paid/due, the project's payments, and the dashboard all sum this one table.

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque', 'card', 'other']

type PaymentInput = {
  project_id: string
  invoice_id: string | null
  payment_date: string
  amount: number
  reason: string
  method: string | null
  reference: string | null
}

function parsePayment(body: Record<string, unknown>): PaymentInput {
  const project_id = body.project_id
  const payment_date = body.payment_date
  const amount = body.amount
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  const method = body.method === undefined || body.method === null || body.method === '' ? null : body.method
  const reference = typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim() : null

  if (project_id === undefined || project_id === null || project_id === '' || !/^\d+$/.test(String(project_id))) {
    throw new HttpError(400, 'Choose a project')
  }
  if (!isIsoDate(payment_date)) throw new HttpError(400, 'Payment date is required')
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Amount received must be greater than 0')
  }
  if (!reason) throw new HttpError(400, 'Enter a reason for the payment (for example: Down payment)')
  if (reason.length > 200) throw new HttpError(400, 'The reason is too long (200 characters at most)')
  if (method !== null && (typeof method !== 'string' || !PAYMENT_METHODS.includes(method))) {
    throw new HttpError(400, 'Payment method must be one of: ' + PAYMENT_METHODS.join(', '))
  }
  if (reference && reference.length > 500) throw new HttpError(400, 'The reference is too long (500 characters at most)')

  const invoice_id = body.invoice_id === undefined || body.invoice_id === null || body.invoice_id === '' ? null : String(body.invoice_id)
  if (invoice_id !== null && !/^\d+$/.test(invoice_id)) throw new HttpError(400, 'Invalid invoice')

  return { project_id: String(project_id), invoice_id, payment_date, amount: roundMoney(amount), reason, method, reference }
}

// Validates a payment against the project and (if applied to one) its invoice. `paymentId` excludes a payment from
// its own invoice total when it is being corrected.
async function checkPayment(client: PoolClient, input: PaymentInput, paymentId: string | null) {
  const projectExists = await paymentsRepository.selectProjectExists(client, input.project_id)
  if (!projectExists) throw new HttpError(400, 'Project does not exist')

  // a payment date can't be in the future (a day of tolerance for time zones)
  const dateOk = await paymentsRepository.selectPaymentDateNotInFuture(client, input.payment_date)
  if (!dateOk) throw new HttpError(400, 'The payment date cannot be in the future')

  if (input.invoice_id !== null) {
    // the invoice must be this project's own invoice; lock it so simultaneous payments can't both pass
    const invoice = await paymentsRepository.selectInvoiceForPaymentCheck(client, input.invoice_id, input.project_id)
    if (!invoice) throw new HttpError(400, 'That invoice does not belong to this project')

    const othersPaid = await paymentsRepository.selectOtherPaymentsTotalForInvoice(client, input.invoice_id, paymentId)
    const due = roundMoney(Number(invoice.total) - Number(othersPaid))
    if (input.amount > due) {
      throw new HttpError(400, `This payment is more than the amount due on the invoice (${due.toFixed(2)})`)
    }
  }
}

export async function loadPayment(id: string | number) {
  return paymentsRepository.selectPaymentById(id)
}

export async function listPayments(projectId: string | null) {
  return paymentsRepository.selectPayments(projectId)
}

export async function createPayment(body: Record<string, unknown>) {
  const input = parsePayment(body)
  return withTransaction(async (client) => {
    await checkPayment(client, input, null)
    return paymentsRepository.insertPayment(client, input)
  })
}

// A correction: what the payment looked like before is kept in payment_revisions. Payments are never deleted.
export async function correctPayment(id: string, body: Record<string, unknown>) {
  const input = parsePayment(body)
  await withTransaction(async (client) => {
    const current = await paymentsRepository.selectPaymentRowForUpdate(client, id)
    if (!current) throw new HttpError(404, 'Payment not found')
    await checkPayment(client, input, id)
    await paymentsRepository.insertPaymentRevision(client, id, current.row)
    await paymentsRepository.updatePayment(client, id, input)
  })
}
