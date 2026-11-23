import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { disbursementBody, disbursementInvoiceIdParams, disbursementParams } from './disbursements.schemas'
import { createDisbursement, deleteDisbursementById, listDisbursements, requireClientFundsInvoice } from './disbursements.service'

export function registerDisbursementRoutes(app: Express) {
  app.get(
    '/api/invoices/:invoiceId/disbursements',
    allow(Role.Admin),
    validate({ params: disbursementInvoiceIdParams }),
    async (req, res) => {
      try {
        res.json(await listDisbursements(organizationIdOf(req), req.params.invoiceId))
      } catch (err) {
        sendError(res, err, 'Failed to fetch disbursements')
      }
    }
  )

  app.post(
    '/api/invoices/:invoiceId/disbursements',
    allow(Role.Admin),
    validate({ params: disbursementInvoiceIdParams }),
    // The invoice must belong to this company (and be a Client Funds invoice) before the body is even
    // looked at - an id that doesn't always answers 404/400, whatever the body contains.
    async (req, res, next) => {
      try {
        await requireClientFundsInvoice(organizationIdOf(req), req.params.invoiceId)
        next()
      } catch (err) {
        sendError(res, err, 'Failed to record the disbursement')
      }
    },
    validate({ body: disbursementBody }),
    async (req, res) => {
      try {
        const userId = req.user!.id
        const disbursement = await createDisbursement(organizationIdOf(req), req.params.invoiceId, req.body, userId)
        res.status(201).json(disbursement)
      } catch (err) {
        sendError(res, err, 'Failed to record the disbursement')
      }
    }
  )

  app.delete(
    '/api/invoices/:invoiceId/disbursements/:disbursementId',
    allow(Role.Admin),
    validate({ params: disbursementParams }),
    async (req, res) => {
      try {
        await deleteDisbursementById(organizationIdOf(req), req.params.invoiceId, req.params.disbursementId)
        res.status(204).end()
      } catch (err) {
        sendError(res, err, 'Failed to delete the disbursement')
      }
    }
  )
}
