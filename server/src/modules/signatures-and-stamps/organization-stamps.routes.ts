import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { stampKindParams } from './organization-stamps.schemas'
import { imageUploadBody } from './image-upload.schemas'
import { listStamps, saveStamp } from './organization-stamps.service'
import type { StampKind } from './organization-stamps.repository'

// Admin-only.
export function registerOrganizationStampRoutes(app: Express) {
  app.get('/api/organization-stamps', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await listStamps(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch stamps')
    }
  })

  app.put(
    '/api/organization-stamps/:kind',
    allow(Role.Admin),
    validate({ params: stampKindParams, body: imageUploadBody }),
    async (req, res) => {
      try {
        const organizationId = organizationIdOf(req)
        await saveStamp(organizationId, req.params.kind as StampKind, req.body, req.user!.id)
        res.json(await listStamps(organizationId))
      } catch (err) {
        sendError(res, err, 'Failed to save the stamp')
      }
    }
  )
}
