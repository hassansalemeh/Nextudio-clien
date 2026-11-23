import type { z } from 'zod'
import { withTransaction } from '../../db'
import { describeError, HttpError } from '../../shared'
import { redactCredentials, sendMail } from '../../shared/mail'
import { loadEstimate } from '../estimates/estimates.service'
import { quotationDocument, renderPdf } from '../documents/documents.service'
import type { sendEstimateEmailBody } from './estimate-emails.schemas'
import * as estimateEmailsRepository from './estimate-emails.repository'

// estimate_emails has no organization_id of its own: the caller already proved estimateId belongs to
// this company by loading the estimate first (see sendEstimateEmail), but this history list is reached
// directly, so it is also given an organizationId check here for consistency with every other module.
export async function listEstimateEmailHistory(organizationId: string, estimateId: string) {
  const estimate = await loadEstimate(organizationId, estimateId)
  if (!estimate) throw new HttpError(404, 'Estimate not found')
  return estimateEmailsRepository.selectEstimateEmailHistory(estimateId)
}

export async function sendEstimateEmail(
  organizationId: string,
  id: string,
  body: z.infer<typeof sendEstimateEmailBody>,
  sentByUserId: string,
  sentByEmail: string
) {
  const estimate = await loadEstimate(organizationId, id)
  if (!estimate) throw new HttpError(404, 'Estimate not found')

  const { to, cc, subject, message, attach_pdf: attachPdf } = body

  let attachments: { filename: string; content: Buffer; contentType?: string }[] = []
  if (attachPdf) {
    const doc = await quotationDocument(organizationId, id)
    const pdf = await renderPdf(doc)
    attachments = [{ filename: `Quotation_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' }]
  }

  try {
    await sendMail({ to: to as string, cc, subject, text: message, attachments })
  } catch (mailErr) {
    // The estimate itself is left exactly as it was: only a 'failed' history row is added.
    await estimateEmailsRepository.insertFailedEstimateEmail(id, to as string, cc, subject, message, redactCredentials(describeError(mailErr)), sentByUserId, sentByEmail)
    const reason = mailErr instanceof HttpError ? mailErr.message : 'Could not send the email.'
    throw new HttpError(502, reason)
  }

  const emailRow = await withTransaction((client) =>
    estimateEmailsRepository.insertSentEstimateEmailAndAdvanceStatus(client, id, to as string, cc, subject, message, sentByUserId, sentByEmail)
  )

  return { estimate: await loadEstimate(organizationId, id), email: emailRow }
}
