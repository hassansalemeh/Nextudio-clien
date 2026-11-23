import type { z } from 'zod'
import { withTransaction } from '../../db'
import { describeError, HttpError } from '../../shared'
import { redactCredentials, sendMail } from '../../shared/mail'
import { loadReceipt } from '../receipts/receipts.service'
import { receiptDocument, renderPdf } from '../documents/documents.service'
import type { sendReceiptEmailBody } from './receipt-emails.schemas'
import * as receiptEmailsRepository from './receipt-emails.repository'

export async function listReceiptEmailHistory(organizationId: string, receiptId: string) {
  const receipt = await loadReceipt(organizationId, receiptId)
  if (!receipt) throw new HttpError(404, 'Receipt not found')
  return receiptEmailsRepository.selectReceiptEmailHistory(receiptId)
}

export async function sendReceiptEmail(
  organizationId: string,
  id: string,
  body: z.infer<typeof sendReceiptEmailBody>,
  sentByUserId: string,
  sentByEmail: string
) {
  const receipt = await loadReceipt(organizationId, id)
  if (!receipt) throw new HttpError(404, 'Receipt not found')

  const { to, cc, subject, message, attach_pdf: attachPdf } = body

  let attachments: { filename: string; content: Buffer; contentType?: string }[] = []
  if (attachPdf) {
    const doc = await receiptDocument(organizationId, id)
    const pdf = await renderPdf(doc)
    attachments = [{ filename: `Receipt_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' }]
  }

  try {
    await sendMail({ to: to as string, cc, subject, text: message, attachments })
  } catch (mailErr) {
    // The receipt itself is left exactly as it was: only a 'failed' history row is added.
    await receiptEmailsRepository.insertFailedReceiptEmail(id, to as string, cc, subject, message, redactCredentials(describeError(mailErr)), sentByUserId, sentByEmail)
    const reason = mailErr instanceof HttpError ? mailErr.message : 'Could not send the email.'
    throw new HttpError(502, reason)
  }

  const emailRow = await withTransaction((client) =>
    receiptEmailsRepository.insertSentReceiptEmail(client, id, to as string, cc, subject, message, sentByUserId, sentByEmail)
  )

  return { receipt: await loadReceipt(organizationId, id), email: emailRow }
}
