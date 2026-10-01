import type { Express, Request } from 'express'
import { HttpError, sendError } from '../../shared'
import { correctPayment, createPayment, listPayments, loadPayment } from './payments.service'

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
      res.json(await listPayments(projectId))
    } catch (err) {
      sendError(res, err, 'Failed to fetch payments')
    }
  })

  app.post('/api/payments', async (req, res) => {
    try {
      const id = await createPayment(req.body)
      res.status(201).json(await loadPayment(id))
    } catch (err) {
      sendError(res, err, 'Failed to record the payment')
    }
  })

  // A correction: what the payment looked like before is kept in payment_revisions. Payments are never deleted.
  app.put('/api/payments/:paymentId', async (req, res) => {
    try {
      const id = requireId(req)
      await correctPayment(id, req.body)
      res.json(await loadPayment(id))
    } catch (err) {
      sendError(res, err, 'Failed to correct the payment')
    }
  })
}
