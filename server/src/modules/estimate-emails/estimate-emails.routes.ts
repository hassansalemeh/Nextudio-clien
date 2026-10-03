import type { Express } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import { listEstimateEmailHistory, sendEstimateEmail } from './estimate-emails.service'

function requireEstimateId(id: string) {
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Estimate not found')
  return id
}

export function registerEstimateEmailRoutes(app: Express) {
  app.get('/api/estimates/:estimateId/emails', async (req, res) => {
    try {
      const id = requireEstimateId(req.params.estimateId)
      res.json(await listEstimateEmailHistory(organizationIdOf(req), id))
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post('/api/estimates/:estimateId/send-email', async (req, res) => {
    try {
      const id = requireEstimateId(req.params.estimateId)
      const result = await sendEstimateEmail(organizationIdOf(req), id, req.body, req.user!.id, req.user!.email)
      res.status(201).json(result)
    } catch (err) {
      sendError(res, err, 'Failed to send the email')
    }
  })
}
