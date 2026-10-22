import type { Express, Request } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { HttpError, sendError } from '../../shared'
import { createSigner, listSigners, updateSigner, updateSignerImage } from './document-signers.service'

function requireId(req: Request) {
  const id = req.params.signerId
  if (!/^\d+$/.test(id)) throw new HttpError(404, 'Signer not found')
  return id
}

// Admin-only: not in EMPLOYEE_ROUTES, so middleware/auth's enforceRole denies employees by default.
export function registerDocumentSignerRoutes(app: Express) {
  app.get('/api/document-signers', async (req, res) => {
    try {
      res.json(await listSigners(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch signers')
    }
  })

  app.post('/api/document-signers', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      await createSigner(organizationId, req.body)
      res.status(201).json(await listSigners(organizationId))
    } catch (err) {
      sendError(res, err, 'Failed to add the signer', 'A signer with that name already exists')
    }
  })

  app.put('/api/document-signers/:signerId', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      await updateSigner(organizationId, requireId(req), req.body)
      res.json(await listSigners(organizationId))
    } catch (err) {
      sendError(res, err, 'Failed to update the signer', 'A signer with that name already exists')
    }
  })

  app.put('/api/document-signers/:signerId/image', async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      await updateSignerImage(organizationId, requireId(req), req.body, req.user!.id)
      res.json(await listSigners(organizationId))
    } catch (err) {
      sendError(res, err, 'Failed to save the signature image')
    }
  })
}
