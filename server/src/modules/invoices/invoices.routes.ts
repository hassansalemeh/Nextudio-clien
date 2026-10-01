import type { Express, Request } from 'express'
import { HttpError, sendError } from '../../shared'
import * as invoicesService from './invoices.service'

function requireId(req: Request) {
  const id = req.params.invoiceId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Invoice not found')
  return id
}

export function registerInvoiceRoutes(app: Express) {
  app.get('/api/invoices', async (_req, res) => {
    try {
      res.json(await invoicesService.listInvoices())
    } catch (err) {
      sendError(res, err, 'Failed to fetch invoices')
    }
  })

  // Must come before /api/invoices/:invoiceId
  app.get('/api/invoices/next-number', async (req, res) => {
    try {
      if (req.query.type !== 'client_funds') throw new HttpError(400, 'Unsupported invoice type')
      res.json({ invoice_number: await invoicesService.nextClientFundsInvoiceNumber() })
    } catch (err) {
      sendError(res, err, 'Failed to generate an invoice number')
    }
  })

  app.get('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const invoice = await invoicesService.loadInvoice(requireId(req))
      if (!invoice) throw new HttpError(404, 'Invoice not found')
      res.json(invoice)
    } catch (err) {
      sendError(res, err, 'Failed to fetch invoice')
    }
  })

  // Creates a Client Funds invoice directly. Professional invoices are only ever created by approving an
  // estimate (see the estimates module) - this route refuses that type on purpose.
  app.post('/api/invoices', async (req, res) => {
    try {
      const id = await invoicesService.createClientFundsInvoice(req.body)
      res.status(201).json(await invoicesService.loadInvoice(id))
    } catch (err) {
      sendError(res, err, 'Failed to create the invoice', 'That invoice number is already used')
    }
  })

  app.put('/api/invoices/:invoiceId', async (req, res) => {
    try {
      const id = requireId(req)
      await invoicesService.updateClientFundsInvoiceById(id, req.body)
      res.json(await invoicesService.loadInvoice(id))
    } catch (err) {
      sendError(res, err, 'Failed to update the invoice', 'That invoice number is already used')
    }
  })

  // Narrow, Professional-Services-only route: only the contract/signatures fields can change here.
  // Every financial field, the items, and the dates stay exactly as they were frozen at approval.
  app.put('/api/invoices/:invoiceId/contract', async (req, res) => {
    try {
      const id = requireId(req)
      await invoicesService.updateInvoiceContractById(id, req.body)
      res.json(await invoicesService.loadInvoice(id))
    } catch (err) {
      sendError(res, err, 'Failed to update the contract')
    }
  })
}
