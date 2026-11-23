import type { z } from 'zod'
import { withTransaction } from '../../db'
import { describeError, HttpError } from '../../shared'
import { redactCredentials, sendMail } from '../../shared/mail'
import { loadLetter } from '../letters/letters.service'
import { letterDocument, renderPdf } from '../documents/documents.service'
import type { sendLetterEmailBody } from './letter-emails.schemas'
import * as letterEmailsRepository from './letter-emails.repository'

export async function listLetterEmailHistory(organizationId: string, letterId: string) {
  const letter = await loadLetter(organizationId, letterId)
  if (!letter) throw new HttpError(404, 'Letter not found')
  return letterEmailsRepository.selectLetterEmailHistory(letterId)
}

export async function sendLetterEmail(
  organizationId: string,
  id: string,
  body: z.infer<typeof sendLetterEmailBody>,
  sentByUserId: string,
  sentByEmail: string
) {
  const letter = await loadLetter(organizationId, id)
  if (!letter) throw new HttpError(404, 'Letter not found')

  const { to, cc, subject, message, attach_pdf: attachPdf } = body

  let attachments: { filename: string; content: Buffer; contentType?: string }[] = []
  if (attachPdf) {
    const doc = await letterDocument(organizationId, id)
    const pdf = await renderPdf(doc)
    attachments = [{ filename: `Letter_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' }]
  }

  try {
    await sendMail({ to: to as string, cc, subject, text: message, attachments })
  } catch (mailErr) {
    // The letter itself is left exactly as it was: only a 'failed' history row is added.
    await letterEmailsRepository.insertFailedLetterEmail(id, to as string, cc, subject, message, redactCredentials(describeError(mailErr)), sentByUserId, sentByEmail)
    const reason = mailErr instanceof HttpError ? mailErr.message : 'Could not send the email.'
    throw new HttpError(502, reason)
  }

  const emailRow = await withTransaction((client) =>
    letterEmailsRepository.insertSentLetterEmail(client, id, to as string, cc, subject, message, sentByUserId, sentByEmail)
  )

  return { letter: await loadLetter(organizationId, id), email: emailRow }
}
