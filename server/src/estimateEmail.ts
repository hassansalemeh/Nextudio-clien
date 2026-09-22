// "Send by Email" for a quotation: sends the same PDF the admin sees in Preview, using the server-side mailer
// (see mail.ts). Sending never approves the estimate, creates an invoice/project, or changes financial values.
import type { Express } from 'express'
import { pool } from './db'
import { quotationDocument, renderPdf } from './documents'
import { loadEstimate } from './estimates'
import { describeError, HttpError, sendError, withTransaction } from './http'
import { redactCredentials, sendMail } from './mail'

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

function requireEstimateId(id: string) {
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Estimate not found')
  return id
}

const EMAIL_HISTORY_SELECT = `
  SELECT id, recipient, cc, subject, message, status, error, sent_by_email, sent_at
  FROM estimate_emails WHERE estimate_id = $1 ORDER BY sent_at DESC, id DESC`

export function registerEstimateEmailRoutes(app: Express) {
  app.get('/api/estimates/:estimateId/emails', async (req, res) => {
    try {
      const id = requireEstimateId(req.params.estimateId)
      const result = await pool.query(EMAIL_HISTORY_SELECT, [id])
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post('/api/estimates/:estimateId/send-email', async (req, res) => {
    try {
      const id = requireEstimateId(req.params.estimateId)
      const estimate = await loadEstimate(id)
      if (!estimate) throw new HttpError(404, 'Estimate not found')

      const to = parseAddresses(req.body.to, 'Recipient email', true) as string
      const cc = parseAddresses(req.body.cc, 'CC', false)
      const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : ''
      if (!subject) throw new HttpError(400, 'Subject is required')
      const message = typeof req.body.message === 'string' ? req.body.message : ''
      const attachPdf = req.body.attach_pdf !== false

      let attachments: { filename: string; content: Buffer; contentType?: string }[] = []
      if (attachPdf) {
        const doc = await quotationDocument(id)
        const pdf = await renderPdf(doc)
        attachments = [{ filename: `Quotation_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' }]
      }

      const sentByEmail = req.user!.email
      const sentByUserId = req.user!.id

      try {
        await sendMail({ to, cc, subject, text: message, attachments })
      } catch (mailErr) {
        // The estimate itself is left exactly as it was: only a 'failed' history row is added.
        await pool.query(
          `INSERT INTO estimate_emails (estimate_id, recipient, cc, subject, message, status, error, sent_by_user_id, sent_by_email)
           VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7, $8)`,
          [id, to, cc, subject, message, redactCredentials(describeError(mailErr)), sentByUserId, sentByEmail]
        )
        const reason = mailErr instanceof HttpError ? mailErr.message : 'Could not send the email.'
        throw new HttpError(502, reason)
      }

      // Success: record it, and move Draft -> Pending (never auto-approve). Both happen together.
      const emailRow = await withTransaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO estimate_emails (estimate_id, recipient, cc, subject, message, status, sent_by_user_id, sent_by_email)
           VALUES ($1, $2, $3, $4, $5, 'sent', $6, $7)
           RETURNING id, recipient, cc, subject, message, status, error, sent_by_email, sent_at`,
          [id, to, cc, subject, message, sentByUserId, sentByEmail]
        )
        await client.query(`UPDATE estimates SET status = 'pending', updated_at = now() WHERE id = $1 AND status = 'draft'`, [id])
        return inserted.rows[0]
      })

      res.status(201).json({ estimate: await loadEstimate(id), email: emailRow })
    } catch (err) {
      sendError(res, err, 'Failed to send the email')
    }
  })
}
