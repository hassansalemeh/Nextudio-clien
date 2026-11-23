import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { createSignerBody, signerIdParams, updateSignerBody } from './document-signers.schemas'
import { imageUploadBody } from './image-upload.schemas'
import { createSigner, listSigners, updateSigner, updateSignerImage } from './document-signers.service'

// Admin-only.
export function registerDocumentSignerRoutes(app: Express) {
  app.get('/api/document-signers', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await listSigners(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Failed to fetch signers')
    }
  })

  app.post('/api/document-signers', allow(Role.Admin), validate({ body: createSignerBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      await createSigner(organizationId, req.body.display_name)
      res.status(201).json(await listSigners(organizationId))
    } catch (err) {
      sendError(res, err, 'Failed to add the signer', 'A signer with that name already exists')
    }
  })

  app.put('/api/document-signers/:signerId', allow(Role.Admin), validate({ params: signerIdParams, body: updateSignerBody }), async (req, res) => {
    try {
      const organizationId = organizationIdOf(req)
      await updateSigner(organizationId, req.params.signerId, req.body.display_name, req.body.is_active)
      res.json(await listSigners(organizationId))
    } catch (err) {
      sendError(res, err, 'Failed to update the signer', 'A signer with that name already exists')
    }
  })

  app.put(
    '/api/document-signers/:signerId/image',
    allow(Role.Admin),
    validate({ params: signerIdParams, body: imageUploadBody }),
    async (req, res) => {
      try {
        const organizationId = organizationIdOf(req)
        await updateSignerImage(organizationId, req.params.signerId, req.body, req.user!.id)
        res.json(await listSigners(organizationId))
      } catch (err) {
        sendError(res, err, 'Failed to save the signature image')
      }
    }
  )
}
