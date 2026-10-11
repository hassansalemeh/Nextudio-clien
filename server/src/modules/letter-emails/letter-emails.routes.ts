import type { Express } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import { listLetterEmailHistory, sendLetterEmail } from './letter-emails.service'

function requireLetterId(id: string) {
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Letter not found')
  return id
}

export function registerLetterEmailRoutes(app: Express) {
  app.get('/api/letters/:letterId/emails', async (req, res) => {
    try {
      const id = requireLetterId(req.params.letterId)
      res.json(await listLetterEmailHistory(organizationIdOf(req), id))
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post('/api/letters/:letterId/send-email', async (req, res) => {
    try {
      const id = requireLetterId(req.params.letterId)
      const result = await sendLetterEmail(organizationIdOf(req), id, req.body, req.user!.id, req.user!.email)
      res.status(201).json(result)
    } catch (err) {
      sendError(res, err, 'Failed to send the email')
    }
  })
}
