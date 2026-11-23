import type { Express } from 'express'
import { allow, organizationIdOf } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import { sendTestReminderBody } from './reminders.schemas'
import { previewReminders, sendTestReminder } from './reminders.service'

// Admin-only. For testing the daily reminder on demand, without waiting for the scheduled window.
export function registerReminderRoutes(app: Express) {
  // Dry run: who would be reminded and who would be skipped (and why). Sends nothing.
  app.post('/api/reminders/preview', allow(Role.Admin), async (req, res) => {
    try {
      res.json(await previewReminders(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Could not preview reminders')
    }
  })

  // Sends one real reminder email to req.body.testEmail only - never to an employee's contact_email.
  app.post('/api/reminders/send-test', allow(Role.Admin), validate({ body: sendTestReminderBody }), async (req, res) => {
    try {
      res.json(await sendTestReminder(organizationIdOf(req), req.body.testEmail))
    } catch (err) {
      sendError(res, err, 'Could not send the test reminder')
    }
  })
}
