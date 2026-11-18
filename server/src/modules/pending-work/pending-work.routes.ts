import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role } from '../../shared'
import { sendTimeError } from '../time-tracking/time-tracking.service'
import { approvePendingWorkEntry, listPendingWorkEntries, rejectPendingWorkEntry } from './pending-work.service'

export function registerPendingWorkRoutes(app: Express) {
  app.get('/api/pending-work-entries', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await listPendingWorkEntries(organizationIdOf(req)))
    } catch {
      res.status(500).json({ error: 'Failed to fetch pending work entries' })
    }
  })

  app.post('/api/pending-work-entries/:id/reject', allow(Role.Admin), async (req, res) => {
    try {
      await rejectPendingWorkEntry(organizationIdOf(req), req.params.id)
      res.json({ ok: true })
    } catch (err) {
      sendTimeError(res, err, 'Failed to reject the work entry')
    }
  })

  app.post('/api/pending-work-entries/:id/approve', allow(Role.Admin), async (req, res) => {
    const start_date = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : ''
    const end_date = typeof req.body.end_date === 'string' ? req.body.end_date.trim() : ''
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

    try {
      await approvePendingWorkEntry(organizationIdOf(req), req.params.id, start_date, end_date, description)
      res.json({ ok: true })
    } catch (err) {
      sendTimeError(res, err, 'Failed to approve the work entry')
    }
  })
}
