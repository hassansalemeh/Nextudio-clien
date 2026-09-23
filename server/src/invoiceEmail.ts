// "Send by Email" for an invoice (Professional Services or Client Funds): sends the same PDF the admin sees
// in Preview, using the server-side mailer (see mail.ts). Sending never changes the invoice or any financial value.
import type { Express } from 'express'
import { pool } from './db'
import { invoiceDocument, renderPdf } from './documents'
import { loadInvoice } from './invoices'
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

function requireInvoiceId(id: string) {
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Invoice not found')
  return id
}

const EMAIL_HISTORY_SELECT = `
  SELECT id, recipient, cc, subject, message, status, error, sent_by_email, sent_at
  FROM invoice_emails WHERE invoice_id = $1 ORDER BY sent_at DESC, id DESC`

export function registerInvoiceEmailRoutes(app: Express) {
  app.get('/api/invoices/:invoiceId/emails', async (req, res) => {
    try {
      const id = requireInvoiceId(req.params.invoiceId)
      const result = await pool.query(EMAIL_HISTORY_SELECT, [id])
      res.json(result.rows)
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post('/api/invoices/:invoiceId/send-email', async (req, res) => {
    try {
      const id = requireInvoiceId(req.params.invoiceId)
      const invoice = await loadInvoice(id)
      if (!invoice) throw new HttpError(404, 'Invoice not found')

      const to = parseAddresses(req.body.to, 'Recipient email', true) as string
      const cc = parseAddresses(req.body.cc, 'CC', false)
      const subject = typeof req.body.subject === 'string' ? req.body.subject.trim() : ''
      if (!subject) throw new HttpError(400, 'Subject is required')
      const message = typeof req.body.message === 'string' ? req.body.message : ''
      const attachPdf = req.body.attach_pdf !== false

      let attachments: { filename: string; content: Buffer; contentType?: string }[] = []
      if (attachPdf) {
        const doc = await invoiceDocument(id)
        const pdf = await renderPdf(doc)
        const filePrefix = doc.heading === 'INVOICE' ? 'Invoice' : 'ClientFunds'
        attachments = [{ filename: `${filePrefix}_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf`, content: pdf, contentType: 'application/pdf' }]
      }

      const sentByEmail = req.user!.email
      const sentByUserId = req.user!.id

      try {
        await sendMail({ to, cc, subject, text: message, attachments })
      } catch (mailErr) {
        // The invoice itself is left exactly as it was: only a 'failed' history row is added.
        await pool.query(
          `INSERT INTO invoice_emails (invoice_id, recipient, cc, subject, message, status, error, sent_by_user_id, sent_by_email)
           VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7, $8)`,
          [id, to, cc, subject, message, redactCredentials(describeError(mailErr)), sentByUserId, sentByEmail]
        )
        const reason = mailErr instanceof HttpError ? mailErr.message : 'Could not send the email.'
        throw new HttpError(502, reason)
      }

      const emailRow = await withTransaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO invoice_emails (invoice_id, recipient, cc, subject, message, status, sent_by_user_id, sent_by_email)
           VALUES ($1, $2, $3, $4, $5, 'sent', $6, $7)
           RETURNING id, recipient, cc, subject, message, status, error, sent_by_email, sent_at`,
          [id, to, cc, subject, message, sentByUserId, sentByEmail]
        )
        return inserted.rows[0]
      })

      res.status(201).json({ invoice: await loadInvoice(id), email: emailRow })
    } catch (err) {
      sendError(res, err, 'Failed to send the email')
    }
  })
}
