import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { receiptIdParams, sendReceiptEmailBody } from './receipt-emails.schemas'
import { listReceiptEmailHistory, sendReceiptEmail } from './receipt-emails.service'

export function registerReceiptEmailRoutes(app: Express) {
  app.get('/api/receipts/:receiptId/emails', allow(Role.Admin), validate({ params: receiptIdParams }), async (req, res) => {
    try {
      res.json(await listReceiptEmailHistory(organizationIdOf(req), req.params.receiptId))
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post(
    '/api/receipts/:receiptId/send-email',
    allow(Role.Admin),
    validate({ params: receiptIdParams, body: sendReceiptEmailBody }),
    async (req, res) => {
      try {
        const result = await sendReceiptEmail(organizationIdOf(req), req.params.receiptId, req.body, req.user!.id, req.user!.email)
        res.status(201).json(result)
      } catch (err) {
        sendError(res, err, 'Failed to send the email')
      }
    }
  )
}
