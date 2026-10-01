import type { Express } from 'express'
import { projectFinancials } from './project-financials.service'

export function registerProjectFinancialsRoutes(app: Express) {
  // Numbers only, for every project
  app.get('/api/project-financial-summary', async (_req, res) => {
    try {
      res.json(await projectFinancials())
    } catch {
      res.status(500).json({ error: 'Failed to fetch financial summary' })
    }
  })
}
