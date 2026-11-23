import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { HttpError, Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { cancelPaymentBody, paymentBody, paymentIdParams, paymentListQuery } from './payments.schemas'
import { cancelPayment, correctPayment, createPayment, listPayments, loadPayment } from './payments.service'

export function registerPaymentRoutes(app: Express) {
  // newest first
  app.get('/api/payments', allow(Role.Admin), validate({ query: paymentListQuery }), async (req, res) => {
    try {
      res.json(await listPayments(organizationIdOf(req), req.query.project_id as string | null))
    } catch (err) {
      sendError(res, err, 'Failed to fetch payments')
    }
  })

  // Used to prefill a receipt editor when creating a receipt for an existing payment
  app.get('/api/payments/:paymentId', allow(Role.Admin), validate({ params: paymentIdParams }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const payment = await loadPayment(organizationId, req.params.paymentId)
      if (!payment) throw new HttpError(404, 'Payment not found')
      res.json(payment)
    } catch (err) {
      sendError(res, err, 'Failed to fetch payment')
    }
  })

  app.post('/api/payments', allow(Role.Admin), validate({ body: paymentBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = await createPayment(organizationId, req.body)
      res.status(201).json(await loadPayment(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to record the payment')
    }
  })

  // A correction: what the payment looked like before is kept in payment_revisions. Payments are never deleted.
  app.put('/api/payments/:paymentId', allow(Role.Admin), validate({ params: paymentIdParams, body: paymentBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = req.params.paymentId
      await correctPayment(organizationId, id, req.body)
      res.json(await loadPayment(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to correct the payment')
    }
  })

  // Only for a payment without an active receipt - one with a receipt is cancelled through it instead
  app.post(
    '/api/payments/:paymentId/cancel',
    allow(Role.Admin),
    validate({ params: paymentIdParams, body: cancelPaymentBody }),
    async (req, res) => {
      try {
        const organizationId = organizationIdOf(req)
        const id = req.params.paymentId
        await cancelPayment(organizationId, id, req.body.reason, req.user!.id)
        res.json(await loadPayment(organizationId, id))
      } catch (err) {
        sendError(res, err, 'Failed to cancel the payment')
      }
    }
  )
}
