import type { Express } from 'express'
import { HttpError } from '../../shared'
import { createClient, listClients, parseClientInput, updateClient } from './clients.service'
import { organizationIdOf } from '../../middleware/auth'

export function registerClientRoutes(app: Express) {
  app.get('/api/clients', async (req, res) => {
    try {
      res.json(await listClients(organizationIdOf(req)))
    } catch {
      res.status(500).json({ error: 'Failed to fetch clients' })
    }
  })

  app.post('/api/clients', async (req, res) => {
    let input
    try {
      input = parseClientInput(req.body)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      throw err
    }

    try {
      res.status(201).json(await createClient(organizationIdOf(req), input))
    } catch {
      res.status(500).json({ error: 'Failed to create client' })
    }
  })

  // Editing the client record only affects future estimates/invoices: existing documents already carry
  // their own frozen snapshot (name/email/phone/address, taken when each document was created), so this
  // never rewrites anything that already exists.
  app.put('/api/clients/:clientId', async (req, res) => {
    const { clientId } = req.params
    if (!/^\d+$/.test(clientId)) {
      return res.status(404).json({ error: 'Client not found' })
    }

    let input
    try {
      input = parseClientInput(req.body)
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
      throw err
    }

    try {
      const client = await updateClient(organizationIdOf(req), clientId, input)
      if (!client) {
        return res.status(404).json({ error: 'Client not found' })
      }
      res.json(client)
    } catch {
      res.status(500).json({ error: 'Failed to update client' })
    }
  })
}
