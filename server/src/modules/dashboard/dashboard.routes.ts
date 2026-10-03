import type { Express } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { getDashboard } from './dashboard.service'

export function registerDashboardRoutes(app: Express) {
  app.get('/api/dashboard', async (req, res) => {
    try {
      const dayFrom = typeof req.query.day_from === 'string' ? req.query.day_from : undefined
      const dayTo = typeof req.query.day_to === 'string' ? req.query.day_to : undefined
      res.json(await getDashboard(organizationIdOf(req), dayFrom, dayTo))
    } catch (err) {
      console.error('dashboard failed', err)
      res.status(500).json({ error: 'Failed to load the dashboard' })
    }
  })
}
