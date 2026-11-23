import type { Express } from 'express'
import { Role } from '../../shared'
import { createClient, listClients, updateClient } from './clients.service'
import { clientBody, clientIdParams } from './clients.schemas'
import { allow, organizationIdOf } from '../../middleware/auth'
import { validate } from '../../middleware/validate'

export function registerClientRoutes(app: Express) {
  app.get('/api/clients', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await listClients(organizationIdOf(req)))
    } catch {
      res.status(500).json({ error: 'Failed to fetch clients' })
    }
  })

  app.post('/api/clients', allow(Role.Admin), validate({ body: clientBody }), async (req, res) => {
    try {
      res.status(201).json(await createClient(organizationIdOf(req), req.body))
    } catch {
      res.status(500).json({ error: 'Failed to create client' })
    }
  })

  // Editing the client record only affects future estimates/invoices: existing documents already carry
  // their own frozen snapshot (name/email/phone/address, taken when each document was created), so this
  // never rewrites anything that already exists.
  app.put('/api/clients/:clientId', allow(Role.Admin), validate({ params: clientIdParams, body: clientBody }), async (req, res) => {
    try {
      const client = await updateClient(organizationIdOf(req), req.params.clientId, req.body)
      if (!client) {
        return res.status(404).json({ error: 'Client not found' })
      }
      res.json(client)
    } catch {
      res.status(500).json({ error: 'Failed to update client' })
    }
  })
}
