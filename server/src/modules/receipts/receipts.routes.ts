import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { HttpError, Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { cancelReceiptBody, createReceiptBody, receiptIdParams, updateReceiptBody } from './receipts.schemas'
import * as receiptsService from './receipts.service'

export function registerReceiptRoutes(app: Express) {
  app.get('/api/receipts', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await receiptsService.listReceipts(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch receipts')
    }
  })

  // Must come before /api/receipts/:receiptId
  app.get('/api/receipts/next-number', allow(Role.Admin), async (req, res) => {
    try {
      res.json({ receipt_number: await receiptsService.nextReceiptNumber(organizationIdOf(req)) })
    } catch (err) {
      sendError(res, err, 'Failed to generate a receipt number')
    }
  })

  app.get('/api/receipts/:receiptId', allow(Role.Admin), validate({ params: receiptIdParams }), async (req, res) => {
    try {
      const receipt = await receiptsService.loadReceipt(organizationIdOf(req), req.params.receiptId)
      if (!receipt) throw new HttpError(404, 'Receipt not found')
      res.json(receipt)
    } catch (err) {
      sendError(res, err, 'Failed to fetch receipt')
    }
  })

  app.post('/api/receipts', allow(Role.Admin), validate({ body: createReceiptBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      // No receipt_number typed in: the create form pre-fills a suggestion and the admin just accepts it,
      // but the real number is only finalized inside createReceipt, under a lock, right before the insert.
      const autoNumber = req.body.receipt_number === null
      const fields = { ...req.body, receipt_number: autoNumber ? await receiptsService.nextReceiptNumber(organizationId) : req.body.receipt_number }

      const id = await receiptsService.createReceipt(organizationId, fields, autoNumber)
      res.status(201).json(await receiptsService.loadReceipt(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to create receipt', 'That receipt number is already used')
    }
  })

  app.put('/api/receipts/:receiptId', allow(Role.Admin), validate({ params: receiptIdParams, body: updateReceiptBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = req.params.receiptId

      await receiptsService.updateReceiptById(organizationId, id, { ...req.body, receipt_number: req.body.receipt_number as string })
      res.json(await receiptsService.loadReceipt(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to update receipt', 'That receipt number is already used')
    }
  })

  // Cancels the receipt and its linked payment together. Never deletes either.
  app.post(
    '/api/receipts/:receiptId/cancel',
    allow(Role.Admin),
    validate({ params: receiptIdParams, body: cancelReceiptBody }),
    async (req, res) => {
      try {
        const organizationId = organizationIdOf(req)
        const id = req.params.receiptId
        await receiptsService.cancelReceipt(organizationId, id, req.body.reason, req.user!.id)
        res.json(await receiptsService.loadReceipt(organizationId, id))
      } catch (err) {
        sendError(res, err, 'Failed to cancel the receipt')
      }
    }
  )
}
