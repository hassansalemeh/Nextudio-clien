import type { Express } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { sendError } from '../../shared'
import { listStamps, saveStamp } from './organization-stamps.service'

// Admin-only: not in EMPLOYEE_ROUTES, so middleware/auth's enforceRole denies employees by default.
export function registerOrganizationStampRoutes(app: Express) {
  app.get('/api/organization-stamps', async (req, res) => {
    try {
      res.json(await listStamps(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch stamps')
    }
  })

  app.put('/api/organization-stamps/:kind', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      await saveStamp(organizationId, req.params.kind, req.body, req.user!.id)
      res.json(await listStamps(organizationId))
    } catch (err) {
      sendError(res, err, 'Failed to save the stamp')
    }
  })
}
