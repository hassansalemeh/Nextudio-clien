import { HttpError, isIsoDate, roundMoney } from '../../shared'
import * as disbursementsRepository from './disbursements.repository'

async function requireClientFundsInvoice(invoiceId: string) {
  const row = await disbursementsRepository.selectInvoiceTypeById(invoiceId)
  if (!row) throw new HttpError(404, 'Invoice not found')
  if (row.invoice_type !== 'client_funds') {
    throw new HttpError(400, 'Disbursements can only be recorded on a Client Funds invoice')
  }
}

function parseDisbursement(body: Record<string, unknown>) {
  const disbursement_date = body.disbursement_date
  const payee = typeof body.payee === 'string' ? body.payee.trim() : ''
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
  const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null
  const amount = body.amount
  const reference = typeof body.reference === 'string' && body.reference.trim() ? body.reference.trim() : null

  if (!isIsoDate(disbursement_date)) throw new HttpError(400, 'Date is required')
  if (!payee) throw new HttpError(400, 'Enter who the money was paid to (payee / supplier / worker)')
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Amount must be greater than 0')
  }
  return { disbursement_date, payee, description, category, amount: roundMoney(amount), reference }
}

export async function listDisbursements(invoiceId: string) {
  await requireClientFundsInvoice(invoiceId)
  return disbursementsRepository.selectDisbursements(invoiceId)
}

export async function createDisbursement(invoiceId: string, body: Record<string, unknown>, userId: string) {
  await requireClientFundsInvoice(invoiceId)
  const input = parseDisbursement(body)
  return disbursementsRepository.insertDisbursement(invoiceId, input, userId)
}

export async function deleteDisbursementById(invoiceId: string, disbursementId: string) {
  await requireClientFundsInvoice(invoiceId)
  if (!/^\d+$/.test(disbursementId)) throw new HttpError(404, 'Disbursement not found')
  const deletedCount = await disbursementsRepository.deleteDisbursement(invoiceId, disbursementId)
  if (deletedCount === 0) throw new HttpError(404, 'Disbursement not found')
}
