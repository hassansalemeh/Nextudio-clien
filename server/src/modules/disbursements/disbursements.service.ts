import type { z } from 'zod'
import { HttpError, roundMoney } from '../../shared'
import type { disbursementBody } from './disbursements.schemas'
import * as disbursementsRepository from './disbursements.repository'

type DisbursementInput = z.infer<typeof disbursementBody>

async function requireClientFundsInvoice(organizationId: string, invoiceId: string) {
  const row = await disbursementsRepository.selectInvoiceTypeById(organizationId, invoiceId)
  if (!row) throw new HttpError(404, 'Invoice not found')
  if (row.invoice_type !== 'client_funds') {
    throw new HttpError(400, 'Disbursements can only be recorded on a Client Funds invoice')
  }
}

export async function listDisbursements(organizationId: string, invoiceId: string) {
  await requireClientFundsInvoice(organizationId, invoiceId)
  return disbursementsRepository.selectDisbursements(invoiceId)
}

export async function createDisbursement(organizationId: string, invoiceId: string, input: DisbursementInput, userId: string) {
  await requireClientFundsInvoice(organizationId, invoiceId)
  return disbursementsRepository.insertDisbursement(invoiceId, { ...input, amount: roundMoney(input.amount) }, userId)
}

export async function deleteDisbursementById(organizationId: string, invoiceId: string, disbursementId: string) {
  await requireClientFundsInvoice(organizationId, invoiceId)
  const deletedCount = await disbursementsRepository.deleteDisbursement(invoiceId, disbursementId)
  if (deletedCount === 0) throw new HttpError(404, 'Disbursement not found')
}
