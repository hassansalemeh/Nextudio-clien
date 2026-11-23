import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { estimateIdParams, sendEstimateEmailBody } from './estimate-emails.schemas'
import { listEstimateEmailHistory, sendEstimateEmail } from './estimate-emails.service'
import { loadEstimate } from '../estimates/estimates.service'

export function registerEstimateEmailRoutes(app: Express) {
  app.get('/api/estimates/:estimateId/emails', allow(Role.Admin), validate({ params: estimateIdParams }), async (req, res) => {
    try {
      res.json(await listEstimateEmailHistory(organizationIdOf(req), req.params.estimateId))
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post(
    '/api/estimates/:estimateId/send-email',
    allow(Role.Admin),
    validate({ params: estimateIdParams }),
    // The estimate must belong to this company before the body is even looked at - an id that doesn't
    // (wrong company, or just made up) always answers 404, whatever the body contains.
    async (req, res, next) => {
      const estimate = await loadEstimate(organizationIdOf(req), req.params.estimateId)
      if (!estimate) return res.status(404).json({ error: 'Estimate not found' })
      next()
    },
    validate({ body: sendEstimateEmailBody }),
    async (req, res) => {
      try {
        const result = await sendEstimateEmail(organizationIdOf(req), req.params.estimateId, req.body, req.user!.id, req.user!.email)
        res.status(201).json(result)
      } catch (err) {
        sendError(res, err, 'Failed to send the email')
      }
    }
  )
}
