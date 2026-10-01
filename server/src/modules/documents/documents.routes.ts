import type { Express } from 'express'
import { HttpError, sendError } from '../../shared'
import { invoiceDocument, quotationDocument, renderPdf } from './documents.service'

export function registerDocumentRoutes(app: Express) {
  app.get('/api/estimates/:estimateId/pdf', async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.estimateId)) throw new HttpError(404, 'Estimate not found')
      const doc = await quotationDocument(req.params.estimateId)
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
      const doc = await invoiceDocument(req.params.invoiceId)
      const pdf = await renderPdf(doc)
      const filePrefix = doc.invoiceType === 'client_funds' ? 'ClientFunds' : 'Invoice'
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${filePrefix}_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the invoice PDF')
    }
  })
}
