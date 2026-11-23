import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { HttpError, Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { createEstimateBody, estimateIdParams, reuseTextQuery, updateEstimateBody } from './estimates.schemas'
import * as estimatesService from './estimates.service'

export function registerEstimateRoutes(app: Express) {
  app.get('/api/estimates', allow(Role.Admin), async (req, res) => {
    try {
      // Approved estimates have become invoices, so they leave this list (they can still be opened by id)
      res.json(await estimatesService.listOpenEstimates(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch estimates')
    }
  })

  // Must come before /api/estimates/:estimateId
  app.get('/api/estimates/next-number', allow(Role.Admin), async (req, res) => {
    try {
      res.json({ estimate_number: await estimatesService.nextEstimateNumber(organizationIdOf(req)) })
    } catch (err) {
      sendError(res, err, 'Failed to generate an estimate number')
    }
  })

  // Previous text typed into this section across past estimates, for the editor's "Reuse previous text" picker.
  // Must come before /api/estimates/:estimateId. Deduplicated and grouped in SQL so identical wording collapses to one row.
  app.get('/api/estimates/reuse-text', allow(Role.Admin), validate({ query: reuseTextQuery }), async (req, res) => {
    try {
      const { field, q } = req.query as unknown as { field: string | null; q: string | null }
      res.json(await estimatesService.listReuseText(organizationIdOf(req), field ?? '', q ?? ''))
    } catch (err) {
      sendError(res, err, 'Failed to load previous text')
    }
  })

  app.get('/api/estimates/:estimateId', allow(Role.Admin), validate({ params: estimateIdParams }), async (req, res) => {
    try {
      const estimate = await estimatesService.loadEstimate(organizationIdOf(req), req.params.estimateId)
      if (!estimate) throw new HttpError(404, 'Estimate not found')
      res.json(estimate)
    } catch (err) {
      sendError(res, err, 'Failed to fetch estimate')
    }
  })

  app.post('/api/estimates', allow(Role.Admin), validate({ body: createEstimateBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      // No estimate_number typed in: the create form pre-fills a suggestion and the admin just accepts it,
      // but the real number is only finalized inside createEstimate, under a lock, right before the insert.
      const autoNumber = req.body.estimate_number === null
      const estimate_number = autoNumber ? await estimatesService.nextEstimateNumber(organizationId) : (req.body.estimate_number as string)
      const header = { ...req.body, estimate_number }
      const items = estimatesService.finalizeItems(req.body.items, header.pricing_method)
      if (header.status === 'approved') throw new HttpError(400, 'Use the approve action to approve an estimate')
      estimatesService.computeTotals(items, header.discount_type, header.discount_value, header.pricing_method, header.lump_sum_fee)

      const id = await estimatesService.createEstimate(organizationId, header, items, autoNumber)
      res.status(201).json(await estimatesService.loadEstimate(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to create estimate', 'That estimate number is already used')
    }
  })

  app.put('/api/estimates/:estimateId', allow(Role.Admin), validate({ params: estimateIdParams, body: updateEstimateBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = req.params.estimateId
      const header = { ...req.body, estimate_number: req.body.estimate_number as string }
      const items = estimatesService.finalizeItems(header.items, header.pricing_method)
      estimatesService.computeTotals(items, header.discount_type, header.discount_value, header.pricing_method, header.lump_sum_fee)

      await estimatesService.updateEstimateById(organizationId, id, header, items)
      res.json(await estimatesService.loadEstimate(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to update estimate', 'That estimate number is already used')
    }
  })

  app.post('/api/estimates/:estimateId/approve', allow(Role.Admin), validate({ params: estimateIdParams }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = req.params.estimateId
      const result = await estimatesService.approveEstimate(organizationId, id)
      res.status(result.created ? 201 : 200).json({ ...(await estimatesService.loadEstimate(organizationId, id)), already_approved: !result.created })
    } catch (err) {
      sendError(res, err, 'Failed to approve estimate')
    }
  })

  app.post('/api/estimates/:estimateId/duplicate', allow(Role.Admin), validate({ params: estimateIdParams }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = req.params.estimateId
      const newId = await estimatesService.duplicateEstimate(organizationId, id)
      res.status(201).json(await estimatesService.loadEstimate(organizationId, newId))
    } catch (err) {
      sendError(res, err, 'Failed to duplicate estimate')
    }
  })

  app.delete('/api/estimates/:estimateId', allow(Role.Admin), validate({ params: estimateIdParams }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = req.params.estimateId
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
