import type { z } from 'zod'
import { withTransaction } from '../../db'
import { describeError, HttpError } from '../../shared'
import { redactCredentials, sendMail } from '../../shared/mail'
import { loadInvoice } from '../invoices/invoices.service'
import { invoiceDocument, renderPdf } from '../documents/documents.service'
import type { sendInvoiceEmailBody } from './invoice-emails.schemas'
import * as invoiceEmailsRepository from './invoice-emails.repository'

// invoice_emails has no organization_id of its own: the caller already proved invoiceId belongs to this
// company by loading the invoice first (see sendInvoiceEmail), but this history list is reached directly,
// so it is also given an organizationId check here for consistency with every other module.
export async function listInvoiceEmailHistory(organizationId: string, invoiceId: string) {
  const invoice = await loadInvoice(organizationId, invoiceId)
  if (!invoice) throw new HttpError(404, 'Invoice not found')
  return invoiceEmailsRepository.selectInvoiceEmailHistory(invoiceId)
}

export async function sendInvoiceEmail(
  organizationId: string,
  id: string,
  body: z.infer<typeof sendInvoiceEmailBody>,
  sentByUserId: string,
  sentByEmail: string
) {
  const invoice = await loadInvoice(organizationId, id)
  if (!invoice) throw new HttpError(404, 'Invoice not found')

  const { to, cc, subject, message, attach_pdf: attachPdf } = body

  let attachments: { filename: string; content: Buffer; contentType?: string }[] = []
  if (attachPdf) {
    const doc = await invoiceDocument(organizationId, id)
    const pdf = await renderPdf(doc)
    const filePrefix = doc.heading === 'INVOICE' ? 'Invoice' : 'ClientFunds'
    attachments = [{ filename: `${filePrefix}_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' }]
  }

  try {
    await sendMail({ to: to as string, cc, subject, text: message, attachments })
  } catch (mailErr) {
    // The invoice itself is left exactly as it was: only a 'failed' history row is added.
    await invoiceEmailsRepository.insertFailedInvoiceEmail(id, to as string, cc, subject, message, redactCredentials(describeError(mailErr)), sentByUserId, sentByEmail)
    const reason = mailErr instanceof HttpError ? mailErr.message : 'Could not send the email.'
    throw new HttpError(502, reason)
  }

  const emailRow = await withTransaction((client) => invoiceEmailsRepository.insertSentInvoiceEmail(client, id, to as string, cc, subject, message, sentByUserId, sentByEmail))

  return { invoice: await loadInvoice(organizationId, id), email: emailRow }
}
