import type { Express } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import { listInvoiceEmailHistory, sendInvoiceEmail } from './invoice-emails.service'

function requireInvoiceId(id: string) {
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Invoice not found')
  return id
}

export function registerInvoiceEmailRoutes(app: Express) {
  app.get('/api/invoices/:invoiceId/emails', async (req, res) => {
    try {
      const id = requireInvoiceId(req.params.invoiceId)
      res.json(await listInvoiceEmailHistory(organizationIdOf(req), id))
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post('/api/invoices/:invoiceId/send-email', async (req, res) => {
    try {
      const id = requireInvoiceId(req.params.invoiceId)
      const result = await sendInvoiceEmail(organizationIdOf(req), id, req.body, req.user!.id, req.user!.email)
      res.status(201).json(result)
    } catch (err) {
      sendError(res, err, 'Failed to send the email')
    }
  })
}
