import type { Express, Request } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import { createDisbursement, deleteDisbursementById, listDisbursements } from './disbursements.service'

function requireInvoiceId(req: Request) {
  const id = req.params.invoiceId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Invoice not found')
  return id
}

export function registerDisbursementRoutes(app: Express) {
  app.get('/api/invoices/:invoiceId/disbursements', async (req, res) => {
    try {
      const invoiceId = requireInvoiceId(req)
      res.json(await listDisbursements(organizationIdOf(req), invoiceId))
    } catch (err) {
      sendError(res, err, 'Failed to fetch disbursements')
    }
  })

  app.post('/api/invoices/:invoiceId/disbursements', async (req, res) => {
    try {
      const invoiceId = requireInvoiceId(req)
      const userId = req.user!.id
      const disbursement = await createDisbursement(organizationIdOf(req), invoiceId, req.body, userId)
      res.status(201).json(disbursement)
    } catch (err) {
      sendError(res, err, 'Failed to record the disbursement')
    }
  })

  app.delete('/api/invoices/:invoiceId/disbursements/:disbursementId', async (req, res) => {
    try {
      const invoiceId = requireInvoiceId(req)
      await deleteDisbursementById(organizationIdOf(req), invoiceId, req.params.disbursementId)
      res.status(204).end()
    } catch (err) {
      sendError(res, err, 'Failed to delete the disbursement')
    }
  })
}
