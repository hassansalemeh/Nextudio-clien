import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { HttpError, Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { createClientFundsInvoiceBody, invoiceIdParams, nextInvoiceNumberQuery, updateClientFundsInvoiceBody, updateInvoiceContractBody } from './invoices.schemas'
import * as invoicesService from './invoices.service'

export function registerInvoiceRoutes(app: Express) {
  app.get('/api/invoices', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await invoicesService.listInvoices(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch invoices')
    }
  })

  // Must come before /api/invoices/:invoiceId
  app.get('/api/invoices/next-number', allow(Role.Admin), validate({ query: nextInvoiceNumberQuery }), async (req, res) => {
    try {
      res.json({ invoice_number: await invoicesService.nextClientFundsInvoiceNumber(organizationIdOf(req)) })
    } catch (err) {
      sendError(res, err, 'Failed to generate an invoice number')
    }
  })

  app.get('/api/invoices/:invoiceId', allow(Role.Admin), validate({ params: invoiceIdParams }), async (req, res) => {
    try {
      const invoice = await invoicesService.loadInvoice(organizationIdOf(req), req.params.invoiceId)
      if (!invoice) throw new HttpError(404, 'Invoice not found')
      res.json(invoice)
    } catch (err) {
      sendError(res, err, 'Failed to fetch invoice')
    }
  })

  // Creates a Client Funds invoice directly. Professional invoices are only ever created by approving an
  // estimate (see the estimates module) - this route refuses that type on purpose.
  app.post('/api/invoices', allow(Role.Admin), validate({ body: createClientFundsInvoiceBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = await invoicesService.createClientFundsInvoice(organizationId, req.body)
      res.status(201).json(await invoicesService.loadInvoice(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to create the invoice', 'That invoice number is already used')
    }
  })

  app.put(
    '/api/invoices/:invoiceId',
    allow(Role.Admin),
    validate({ params: invoiceIdParams, body: updateClientFundsInvoiceBody }),
    async (req, res) => {
      try {
        const organizationId = organizationIdOf(req)
        const id = req.params.invoiceId
        // invoice_number is optional at the schema level (see invoices.schemas) - a PUT that omits it keeps
        // the invoice unnumbered the same way the original code's parseClientFundsHeader did (it never
        // required one on update either).
        await invoicesService.updateClientFundsInvoiceById(organizationId, id, { ...req.body, invoice_number: req.body.invoice_number ?? '' })
        res.json(await invoicesService.loadInvoice(organizationId, id))
      } catch (err) {
        sendError(res, err, 'Failed to update the invoice', 'That invoice number is already used')
      }
    }
  )

  // Narrow, Professional-Services-only route: only the contract/signatures fields can change here.
  // Every financial field, the items, and the dates stay exactly as they were frozen at approval.
  app.put(
    '/api/invoices/:invoiceId/contract',
    allow(Role.Admin),
    validate({ params: invoiceIdParams, body: updateInvoiceContractBody }),
    async (req, res) => {
      try {
        const organizationId = organizationIdOf(req)
        const id = req.params.invoiceId
        await invoicesService.updateInvoiceContractById(organizationId, id, req.body)
        res.json(await invoicesService.loadInvoice(organizationId, id))
      } catch (err) {
        sendError(res, err, 'Failed to update the contract')
      }
    }
  )
}
