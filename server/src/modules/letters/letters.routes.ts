import type { Express, Request } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import * as lettersService from './letters.service'

function requireId(req: Request) {
  const id = req.params.letterId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Letter not found')
  return id
}

export function registerLetterRoutes(app: Express) {
  app.get('/api/letters', async (req, res) => {
    try {
      res.json(await lettersService.listLetters(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch letters')
    }
  })

  // Must come before /api/letters/:letterId
  app.get('/api/letters/next-number', async (req, res) => {
    try {
      res.json({ letter_number: await lettersService.nextLetterNumber(organizationIdOf(req)) })
    } catch (err) {
      sendError(res, err, 'Failed to generate a letter number')
    }
  })

  app.get('/api/letters/:letterId', async (req, res) => {
    try {
      const letter = await lettersService.loadLetter(organizationIdOf(req), requireId(req))
      if (!letter) throw new HttpError(404, 'Letter not found')
      res.json(letter)
    } catch (err) {
      sendError(res, err, 'Failed to fetch letter')
    }
  })

  app.post('/api/letters', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const body = { ...req.body }
      const autoNumber = typeof body.letter_number !== 'string' || !body.letter_number.trim()
      // Only a placeholder for parseHeader's "letter_number is required" check below - when autoNumber
      // is true, createLetter throws this away and computes the real number itself, under a lock, right
      // before the insert.
      if (autoNumber) body.letter_number = await lettersService.nextLetterNumber(organizationId)
      const header = lettersService.parseHeader(body)

      const id = await lettersService.createLetter(organizationId, header, autoNumber)
      res.status(201).json(await lettersService.loadLetter(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to create letter', 'That letter number is already used')
    }
  })

  app.put('/api/letters/:letterId', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      const header = lettersService.parseHeader(req.body)

      await lettersService.updateLetterById(organizationId, id, header)
      res.json(await lettersService.loadLetter(organizationId, id))
    } catch (err) {
      sendError(res, err, 'Failed to update letter', 'That letter number is already used')
    }
  })

  app.delete('/api/letters/:letterId', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      const id = requireId(req)
      await lettersService.deleteLetter(organizationId, id)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to delete letter')
    }
  })
}
