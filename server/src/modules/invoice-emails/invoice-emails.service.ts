import { withTransaction } from '../../db'
import { describeError, HttpError } from '../../shared'
import { redactCredentials, sendMail } from '../../shared/mail'
import { loadInvoice } from '../invoices/invoices.service'
import { invoiceDocument, renderPdf } from '../documents/documents.service'
import * as invoiceEmailsRepository from './invoice-emails.repository'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// A single address, or several separated by commas. Returns a normalised "a@x.com, b@y.com" string, or null.
function parseAddresses(value: unknown, field: string, required: boolean): string | null {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) {
    if (required) throw new HttpError(400, `${field} is required`)
    return null
  }
  const addresses = raw
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)
  for (const address of addresses) {
    if (!EMAIL_RE.test(address)) throw new HttpError(400, `"${address}" is not a valid email address`)
  }
  return addresses.join(', ')
}

// invoice_emails has no organization_id of its own: the caller already proved invoiceId belongs to this
// company by loading the invoice first (see sendInvoiceEmail), but this history list is reached directly,
// so it is also given an organizationId check here for consistency with every other module.
export async function listInvoiceEmailHistory(organizationId: string, invoiceId: string) {
  const invoice = await loadInvoice(organizationId, invoiceId)
  if (!invoice) throw new HttpError(404, 'Invoice not found')
  return invoiceEmailsRepository.selectInvoiceEmailHistory(invoiceId)
}

export async function sendInvoiceEmail(organizationId: string, id: string, body: Record<string, unknown>, sentByUserId: string, sentByEmail: string) {
  const invoice = await loadInvoice(organizationId, id)
  if (!invoice) throw new HttpError(404, 'Invoice not found')

  const to = parseAddresses(body.to, 'Recipient email', true) as string
  const cc = parseAddresses(body.cc, 'CC', false)
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  if (!subject) throw new HttpError(400, 'Subject is required')
  const message = typeof body.message === 'string' ? body.message : ''
  const attachPdf = body.attach_pdf !== false

  let attachments: { filename: string; content: Buffer; contentType?: string }[] = []
  if (attachPdf) {
    const doc = await invoiceDocument(organizationId, id)
    const pdf = await renderPdf(doc)
    const filePrefix = doc.heading === 'INVOICE' ? 'Invoice' : 'ClientFunds'
    attachments = [{ filename: `${filePrefix}_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' }]
  }

  try {
    await sendMail({ to, cc, subject, text: message, attachments })
  } catch (mailErr) {
    // The invoice itself is left exactly as it was: only a 'failed' history row is added.
    await invoiceEmailsRepository.insertFailedInvoiceEmail(id, to, cc, subject, message, redactCredentials(describeError(mailErr)), sentByUserId, sentByEmail)
    const reason = mailErr instanceof HttpError ? mailErr.message : 'Could not send the email.'
    throw new HttpError(502, reason)
  }

  const emailRow = await withTransaction((client) => invoiceEmailsRepository.insertSentInvoiceEmail(client, id, to, cc, subject, message, sentByUserId, sentByEmail))

  return { invoice: await loadInvoice(organizationId, id), email: emailRow }
}
