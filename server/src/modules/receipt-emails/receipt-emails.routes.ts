import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { receiptIdParams, sendReceiptEmailBody } from './receipt-emails.schemas'
import { listReceiptEmailHistory, sendReceiptEmail } from './receipt-emails.service'
import { loadReceipt } from '../receipts/receipts.service'

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
    validate({ params: receiptIdParams }),
    // The receipt must belong to this company before the body is even looked at - an id that doesn't
    // (wrong company, or just made up) always answers 404, whatever the body contains.
    async (req, res, next) => {
      const receipt = await loadReceipt(organizationIdOf(req), req.params.receiptId)
      if (!receipt) return res.status(404).json({ error: 'Receipt not found' })
      next()
    },
    validate({ body: sendReceiptEmailBody }),
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
