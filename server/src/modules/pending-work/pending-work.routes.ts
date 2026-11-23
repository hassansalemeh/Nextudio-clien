import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role } from '../../shared'
import { validate } from '../../middleware/validate'
import { approvePendingWorkEntryBody, pendingWorkEntryIdParams } from './pending-work.schemas'
import { sendTimeError } from '../time-tracking/time-tracking.service'
import { approvePendingWorkEntry, listPendingWorkEntries, rejectPendingWorkEntry, requirePendingWorkEntry } from './pending-work.service'

export function registerPendingWorkRoutes(app: Express) {
  app.get('/api/pending-work-entries', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await listPendingWorkEntries(organizationIdOf(req)))
    } catch {
      res.status(500).json({ error: 'Failed to fetch pending work entries' })
    }
  })

  app.post('/api/pending-work-entries/:id/reject', allow(Role.Admin), validate({ params: pendingWorkEntryIdParams }), async (req, res) => {
    try {
      await rejectPendingWorkEntry(organizationIdOf(req), req.params.id)
      res.json({ ok: true })
    } catch (err) {
      sendTimeError(res, err, 'Failed to reject the work entry')
    }
  })

  app.post(
    '/api/pending-work-entries/:id/approve',
    allow(Role.Admin),
    validate({ params: pendingWorkEntryIdParams }),
    // The entry must belong to this company and still be pending before the body is even looked at - an id
    // that doesn't (wrong company, just made up, or already reviewed) always answers 404/400, whatever the
    // body contains.
    async (req, res, next) => {
      try {
        await requirePendingWorkEntry(organizationIdOf(req), req.params.id)
        next()
      } catch (err) {
        sendTimeError(res, err, 'Failed to approve the work entry')
      }
    },
    validate({ body: approvePendingWorkEntryBody }),
    async (req, res) => {
      try {
        await approvePendingWorkEntry(organizationIdOf(req), req.params.id, req.body.start_date, req.body.end_date, req.body.description)
        res.json({ ok: true })
      } catch (err) {
        sendTimeError(res, err, 'Failed to approve the work entry')
      }
    }
  )
}
