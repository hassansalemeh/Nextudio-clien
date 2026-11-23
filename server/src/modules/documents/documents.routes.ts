import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { estimateIdParams, invoiceIdParams, letterIdParams, receiptIdParams } from './documents.schemas'
import { invoiceDocument, letterDocument, quotationDocument, receiptDocument, renderPdf } from './documents.service'

export function registerDocumentRoutes(app: Express) {
  app.get('/api/estimates/:estimateId/pdf', allow(Role.Admin), validate({ params: estimateIdParams }), async (req, res) => {
    try {
      const doc = await quotationDocument(organizationIdOf(req), req.params.estimateId)
      const pdf = await renderPdf(doc)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="Quotation_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the quotation PDF')
    }
  })

  app.get('/api/invoices/:invoiceId/pdf', allow(Role.Admin), validate({ params: invoiceIdParams }), async (req, res) => {
    try {
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

  app.get('/api/receipts/:receiptId/pdf', allow(Role.Admin), validate({ params: receiptIdParams }), async (req, res) => {
    try {
      const doc = await receiptDocument(organizationIdOf(req), req.params.receiptId)
      const pdf = await renderPdf(doc)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="Receipt_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the receipt PDF')
    }
  })

  app.get('/api/letters/:letterId/pdf', allow(Role.Admin), validate({ params: letterIdParams }), async (req, res) => {
    try {
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
