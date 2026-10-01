import type { Express } from 'express'
import { sendTimeError } from '../time-tracking/time-tracking.service'
import { approvePendingWorkEntry, listPendingWorkEntries, rejectPendingWorkEntry } from './pending-work.service'

export function registerPendingWorkRoutes(app: Express) {
  app.get('/api/pending-work-entries', async (_req, res) => {
    try {
      res.json(await listPendingWorkEntries())
    } catch {
      res.status(500).json({ error: 'Failed to fetch pending work entries' })
    }
  })

  app.post('/api/pending-work-entries/:id/reject', async (req, res) => {
    try {
      await rejectPendingWorkEntry(req.params.id)
      res.json({ ok: true })
    } catch (err) {
      sendTimeError(res, err, 'Failed to reject the work entry')
    }
  })

  app.post('/api/pending-work-entries/:id/approve', async (req, res) => {
    const start_date = typeof req.body.start_date === 'string' ? req.body.start_date.trim() : ''
    const end_date = typeof req.body.end_date === 'string' ? req.body.end_date.trim() : ''
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

    try {
      await approvePendingWorkEntry(req.params.id, start_date, end_date, description)
      res.json({ ok: true })
    } catch (err) {
      sendTimeError(res, err, 'Failed to approve the work entry')
    }
  })
}
