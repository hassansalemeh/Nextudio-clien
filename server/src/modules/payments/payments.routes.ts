import type { Express, Request } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import { cancelPayment, correctPayment, createPayment, listPayments, loadPayment } from './payments.service'

function requireId(req: Request) {
  const id = req.params.paymentId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Payment not found')
  return id
}

export function registerPaymentRoutes(app: Express) {
  // newest first
  app.get('/api/payments', async (req, res) => {
    try {
      const projectId = typeof req.query.project_id === 'string' && /^\d+$/.test(req.query.project_id) ? req.query.project_id : null
      res.json(await listPayments(organizationIdOf(req), projectId))
    } catch (err) {
      sendError(res, err, 'Failed to fetch payments')
    }
  })

  // Used to prefill a receipt editor when creating a receipt for an existing payment
  app.get('/api/payments/:paymentId', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const payment = await loadPayment(organizationId, requireId(req))
      if (!payment) throw new HttpError(404, 'Payment not found')
      res.json(payment)
    } catch (err) {
      sendError(res, err, 'Failed to fetch payment')
    }
  })

  app.post('/api/payments', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = await createPayment(organizationId, req.body)
      res.status(201).json(await loadPayment(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to record the payment')
    }
  })

  // A correction: what the payment looked like before is kept in payment_revisions. Payments are never deleted.
  app.put('/api/payments/:paymentId', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      await correctPayment(organizationId, id, req.body)
      res.json(await loadPayment(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to correct the payment')
    }
  })

  // Only for a payment without an active receipt - one with a receipt is cancelled through it instead
  app.post('/api/payments/:paymentId/cancel', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      const reason = typeof req.body.reason === 'string' ? req.body.reason : ''
      await cancelPayment(organizationId, id, reason, req.user!.id)
      res.json(await loadPayment(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to cancel the payment')
    }
  })
}
