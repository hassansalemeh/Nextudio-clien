import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { HttpError, Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { createLetterBody, letterIdParams, updateLetterBody } from './letters.schemas'
import * as lettersService from './letters.service'
import type { LetterHeader } from './letters.service'

export function registerLetterRoutes(app: Express) {
  app.get('/api/letters', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await lettersService.listLetters(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch letters')
    }
  })

  // Must come before /api/letters/:letterId
  app.get('/api/letters/next-number', allow(Role.Admin), async (req, res) => {
    try {
      res.json({ letter_number: await lettersService.nextLetterNumber(organizationIdOf(req)) })
    } catch (err) {
      sendError(res, err, 'Failed to generate a letter number')
    }
  })

  app.get('/api/letters/:letterId', allow(Role.Admin), validate({ params: letterIdParams }), async (req, res) => {
    try {
      const letter = await lettersService.loadLetter(organizationIdOf(req), req.params.letterId)
      if (!letter) throw new HttpError(404, 'Letter not found')
      res.json(letter)
    } catch (err) {
      sendError(res, err, 'Failed to fetch letter')
    }
  })

  app.post('/api/letters', allow(Role.Admin), validate({ body: createLetterBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      // No letter_number typed in: the create form pre-fills a suggestion and the admin just accepts it,
      // but the real number is only finalized inside createLetter, under a lock, right before the insert.
      const autoNumber = req.body.letter_number === null
      const header: LetterHeader = {
        ...req.body,
        letter_number: autoNumber ? await lettersService.nextLetterNumber(organizationId) : (req.body.letter_number as string),
      }

      const id = await lettersService.createLetter(organizationId, header, autoNumber)
      res.status(201).json(await lettersService.loadLetter(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to create letter', 'That letter number is already used')
    }
  })

  app.put('/api/letters/:letterId', allow(Role.Admin), validate({ params: letterIdParams, body: updateLetterBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = req.params.letterId
      const header: LetterHeader = { ...req.body, letter_number: req.body.letter_number as string }

      await lettersService.updateLetterById(organizationId, id, header)
      res.json(await lettersService.loadLetter(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to update letter', 'That letter number is already used')
    }
  })

  app.delete('/api/letters/:letterId', allow(Role.Admin), validate({ params: letterIdParams }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = req.params.letterId
      await lettersService.deleteLetter(organizationId, id)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to delete letter')
    }
  })
}
