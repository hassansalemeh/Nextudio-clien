import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { letterIdParams, sendLetterEmailBody } from './letter-emails.schemas'
import { listLetterEmailHistory, sendLetterEmail } from './letter-emails.service'
import { loadLetter } from '../letters/letters.service'

export function registerLetterEmailRoutes(app: Express) {
  app.get('/api/letters/:letterId/emails', allow(Role.Admin), validate({ params: letterIdParams }), async (req, res) => {
    try {
      res.json(await listLetterEmailHistory(organizationIdOf(req), req.params.letterId))
    } catch (err) {
      sendError(res, err, 'Failed to fetch email history')
    }
  })

  app.post(
    '/api/letters/:letterId/send-email',
    allow(Role.Admin),
    validate({ params: letterIdParams }),
    // The letter must belong to this company before the body is even looked at - an id that doesn't
    // (wrong company, or just made up) always answers 404, whatever the body contains.
    async (req, res, next) => {
      const letter = await loadLetter(organizationIdOf(req), req.params.letterId)
      if (!letter) return res.status(404).json({ error: 'Letter not found' })
      next()
    },
    validate({ body: sendLetterEmailBody }),
    async (req, res) => {
      try {
        const result = await sendLetterEmail(organizationIdOf(req), req.params.letterId, req.body, req.user!.id, req.user!.email)
        res.status(201).json(result)
      } catch (err) {
        sendError(res, err, 'Failed to send the email')
      }
    }
  )
}
