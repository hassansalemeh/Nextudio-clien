import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role } from '../../shared'
import { validate } from '../../middleware/validate'
import { dashboardQuery } from './dashboard.schemas'
import { getDashboard } from './dashboard.service'

export function registerDashboardRoutes(app: Express) {
  app.get('/api/dashboard', allow(Role.Admin), validate({ query: dashboardQuery }), async (req, res) => {
    try {
      const { day_from, day_to } = req.query as unknown as { day_from: string | null; day_to: string | null }
      res.json(await getDashboard(organizationIdOf(req), day_from ?? undefined, day_to ?? undefined))
    } catch (err) {
      console.error('dashboard failed', err)
      res.status(500).json({ error: 'Failed to load the dashboard' })
    }
  })
}
