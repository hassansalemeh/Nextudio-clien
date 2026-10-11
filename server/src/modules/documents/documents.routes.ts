import type { Express } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import { invoiceDocument, letterDocument, quotationDocument, receiptDocument, renderPdf } from './documents.service'

export function registerDocumentRoutes(app: Express) {
  app.get('/api/estimates/:estimateId/pdf', async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.estimateId)) throw new HttpError(404, 'Estimate not found')
      const doc = await quotationDocument(organizationIdOf(req), req.params.estimateId)
      const pdf = await renderPdf(doc)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="Quotation_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the quotation PDF')
    }
  })

  app.get('/api/invoices/:invoiceId/pdf', async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.invoiceId)) throw new HttpError(404, 'Invoice not found')
      const doc = await invoiceDocument(organizationIdOf(req), req.params.invoiceId)
      const pdf = await renderPdf(doc)
      const filePrefix = doc.invoiceType === 'client_funds' ? 'ClientFunds' : 'Invoice'
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${filePrefix}_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the invoice PDF')
    }
  })

  app.get('/api/receipts/:receiptId/pdf', async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.receiptId)) throw new HttpError(404, 'Receipt not found')
      const doc = await receiptDocument(organizationIdOf(req), req.params.receiptId)
      const pdf = await renderPdf(doc)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="Receipt_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the receipt PDF')
    }
  })

  app.get('/api/letters/:letterId/pdf', async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.letterId)) throw new HttpError(404, 'Letter not found')
      const doc = await letterDocument(organizationIdOf(req), req.params.letterId)
      const pdf = await renderPdf(doc)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="Letter_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the letter PDF')
    }
  })
}
