import type { Express, Request } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import * as receiptsService from './receipts.service'

function requireId(req: Request) {
  const id = req.params.receiptId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Receipt not found')
  return id
}

export function registerReceiptRoutes(app: Express) {
  app.get('/api/receipts', async (req, res) => {
    try {
      res.json(await receiptsService.listReceipts(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch receipts')
    }
  })

  // Must come before /api/receipts/:receiptId
  app.get('/api/receipts/next-number', async (req, res) => {
    try {
      res.json({ receipt_number: await receiptsService.nextReceiptNumber(organizationIdOf(req)) })
    } catch (err) {
      sendError(res, err, 'Failed to generate a receipt number')
    }
  })

  app.get('/api/receipts/:receiptId', async (req, res) => {
    try {
      const receipt = await receiptsService.loadReceipt(organizationIdOf(req), requireId(req))
      if (!receipt) throw new HttpError(404, 'Receipt not found')
      res.json(receipt)
    } catch (err) {
      sendError(res, err, 'Failed to fetch receipt')
    }
  })

  app.post('/api/receipts', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const body = { ...req.body }
      const autoNumber = typeof body.receipt_number !== 'string' || !body.receipt_number.trim()
      // Only a placeholder for parseReceiptFields' "receipt_number is required" check below - when
      // autoNumber is true, createReceipt throws this away and computes the real number itself, under a
      // lock, right before the insert.
      if (autoNumber) body.receipt_number = await receiptsService.nextReceiptNumber(organizationId)

      const id = await receiptsService.createReceipt(organizationId, body, autoNumber)
      res.status(201).json(await receiptsService.loadReceipt(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to create receipt', 'That receipt number is already used')
    }
  })

  app.put('/api/receipts/:receiptId', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)

      await receiptsService.updateReceiptById(organizationId, id, req.body)
      res.json(await receiptsService.loadReceipt(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to update receipt', 'That receipt number is already used')
    }
  })

  // Cancels the receipt and its linked payment together. Never deletes either.
  app.post('/api/receipts/:receiptId/cancel', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      const reason = typeof req.body.reason === 'string' ? req.body.reason : ''
      await receiptsService.cancelReceipt(organizationId, id, reason, req.user!.id)
      res.json(await receiptsService.loadReceipt(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to cancel the receipt')
    }
  })
}
