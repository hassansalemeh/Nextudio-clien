import type { Express } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import { listReceiptEmailHistory, sendReceiptEmail } from './receipt-emails.service'

function requireReceiptId(id: string) {
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Receipt not found')
  return id
}

export function registerReceiptEmailRoutes(app: Express) {
  app.get('/api/receipts/:receiptId/emails', async (req, res) => {
    try {
      const id = requireReceiptId(req.params.receiptId)
      res.json(await listReceiptEmailHistory(organizationIdOf(req), id))
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post('/api/receipts/:receiptId/send-email', async (req, res) => {
    try {
      const id = requireReceiptId(req.params.receiptId)
      const result = await sendReceiptEmail(organizationIdOf(req), id, req.body, req.user!.id, req.user!.email)
      res.status(201).json(result)
    } catch (err) {
      sendError(res, err, 'Failed to send the email')
    }
  })
}
