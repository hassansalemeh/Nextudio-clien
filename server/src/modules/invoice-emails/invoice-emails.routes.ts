import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { invoiceIdParams, sendInvoiceEmailBody } from './invoice-emails.schemas'
import { listInvoiceEmailHistory, sendInvoiceEmail } from './invoice-emails.service'
import { loadInvoice } from '../invoices/invoices.service'

export function registerInvoiceEmailRoutes(app: Express) {
  app.get('/api/invoices/:invoiceId/emails', allow(Role.Admin), validate({ params: invoiceIdParams }), async (req, res) => {
    try {
      res.json(await listInvoiceEmailHistory(organizationIdOf(req), req.params.invoiceId))
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post(
    '/api/invoices/:invoiceId/send-email',
    allow(Role.Admin),
    validate({ params: invoiceIdParams }),
    // The invoice must belong to this company before the body is even looked at - an id that doesn't
    // (wrong company, or just made up) always answers 404, whatever the body contains.
    async (req, res, next) => {
      const invoice = await loadInvoice(organizationIdOf(req), req.params.invoiceId)
      if (!invoice) return res.status(404).json({ error: 'Invoice not found' })
      next()
    },
    validate({ body: sendInvoiceEmailBody }),
    async (req, res) => {
      try {
        const result = await sendInvoiceEmail(organizationIdOf(req), req.params.invoiceId, req.body, req.user!.id, req.user!.email)
        res.status(201).json(result)
      } catch (err) {
        sendError(res, err, 'Failed to send the email')
      }
    }
  )
}
