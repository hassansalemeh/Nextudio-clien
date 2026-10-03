import type { Express, Request } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import * as estimatesService from './estimates.service'

function requireId(req: Request) {
  const id = req.params.estimateId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Estimate not found')
  return id
}

export function registerEstimateRoutes(app: Express) {
  app.get('/api/estimates', async (req, res) => {
    try {
      // Approved estimates have become invoices, so they leave this list (they can still be opened by id)
      res.json(await estimatesService.listOpenEstimates(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch estimates')
    }
  })

  // Must come before /api/estimates/:estimateId
  app.get('/api/estimates/next-number', async (req, res) => {
    try {
      res.json({ estimate_number: await estimatesService.nextEstimateNumber(organizationIdOf(req)) })
    } catch (err) {
      sendError(res, err, 'Failed to generate an estimate number')
    }
  })

  // Previous text typed into this section across past estimates, for the editor's "Reuse previous text" picker.
  // Must come before /api/estimates/:estimateId. Deduplicated and grouped in SQL so identical wording collapses to one row.
  app.get('/api/estimates/reuse-text', async (req, res) => {
    try {
      const field = typeof req.query.field === 'string' ? req.query.field : ''
      const search = typeof req.query.q === 'string' ? req.query.q.trim() : ''
      res.json(await estimatesService.listReuseText(organizationIdOf(req), field, search))
    } catch (err) {
      sendError(res, err, 'Failed to load previous text')
    }
  })

  app.get('/api/estimates/:estimateId', async (req, res) => {
    try {
      const estimate = await estimatesService.loadEstimate(organizationIdOf(req), requireId(req))
      if (!estimate) throw new HttpError(404, 'Estimate not found')
      res.json(estimate)
    } catch (err) {
      sendError(res, err, 'Failed to fetch estimate')
    }
  })

  app.post('/api/estimates', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const body = { ...req.body }
      const autoNumber = typeof body.estimate_number !== 'string' || !body.estimate_number.trim()
      // Only a placeholder for parseHeader's "estimate_number is required" check below - when autoNumber
      // is true, createEstimate throws this away and computes the real number itself, under a lock, right
      // before the insert (a number computed here, outside that lock, could be taken by the time we get there).
      if (autoNumber) body.estimate_number = await estimatesService.nextEstimateNumber(organizationId)
      const header = estimatesService.parseHeader(body)
      const items = estimatesService.parseItems(req.body.items, header.pricing_method as string)
      if (header.status === 'approved') throw new HttpError(400, 'Use the approve action to approve an estimate')
      estimatesService.computeTotals(items, header.discount_type as string, header.discount_value as number, header.pricing_method as string, header.lump_sum_fee as number)

      const id = await estimatesService.createEstimate(organizationId, header, items, autoNumber)
      res.status(201).json(await estimatesService.loadEstimate(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to create estimate', 'That estimate number is already used')
    }
  })

  app.put('/api/estimates/:estimateId', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      const header = estimatesService.parseHeader(req.body)
      const items = estimatesService.parseItems(req.body.items, header.pricing_method as string)
      estimatesService.computeTotals(items, header.discount_type as string, header.discount_value as number, header.pricing_method as string, header.lump_sum_fee as number)

      await estimatesService.updateEstimateById(organizationId, id, header, items)
      res.json(await estimatesService.loadEstimate(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to update estimate', 'That estimate number is already used')
    }
  })

  app.post('/api/estimates/:estimateId/approve', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      const result = await estimatesService.approveEstimate(organizationId, id)
      res.status(result.created ? 201 : 200).json({ ...(await estimatesService.loadEstimate(organizationId, id)), already_approved: !result.created })
    } catch (err) {
      sendError(res, err, 'Failed to approve estimate')
    }
  })

  app.post('/api/estimates/:estimateId/duplicate', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      const newId = await estimatesService.duplicateEstimate(organizationId, id)
      res.status(201).json(await estimatesService.loadEstimate(organizationId, newId))
    } catch (err) {
      sendError(res, err, 'Failed to duplicate estimate')
    }
  })

  app.delete('/api/estimates/:estimateId', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      await estimatesService.deleteEstimate(organizationId, id)
      res.json({ ok: true })
    } catch (err) {
      // Safety net: any other reference we didn't anticipate still blocks deletion instead of cascading
      if ((err as { code?: string }).code === '23503') {
        return res.status(409).json({ error: 'This estimate is still referenced by other records and cannot be deleted.' })
      }
      sendError(res, err, 'Failed to delete estimate')
    }
  })
}
