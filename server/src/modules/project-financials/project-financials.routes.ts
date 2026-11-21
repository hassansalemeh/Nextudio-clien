import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role } from '../../shared'
import { projectFinancials } from './project-financials.service'

export function registerProjectFinancialsRoutes(app: Express) {
  // Numbers only, for every project
  app.get('/api/project-financial-summary', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await projectFinancials(organizationIdOf(req)))
    } catch {
      res.status(500).json({ error: 'Failed to fetch financial summary' })
    }
  })
}
