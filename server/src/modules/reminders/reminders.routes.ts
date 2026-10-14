import type { Express } from 'express'
import { organizationIdOf } from '../../middleware/auth'
import { sendError } from '../../shared'
import { previewReminders, sendTestReminder } from './reminders.service'

// Admin-only (neither path is in EMPLOYEE_ROUTES, so enforceRole denies employees by default). For testing
// the daily reminder on demand, without waiting for the scheduled window.
export function registerReminderRoutes(app: Express) {
  // Dry run: who would be reminded and who would be skipped (and why). Sends nothing.
  app.post('/api/reminders/preview', async (req, res) => {
    try {
      res.json(await previewReminders(organizationIdOf(req)))
    } catch (err) {
      sendError(res, err, 'Could not preview reminders')
    }
  })

  // Sends one real reminder email to req.body.testEmail only - never to an employee's contact_email.
  app.post('/api/reminders/send-test', async (req, res) => {
    try {
      res.json(await sendTestReminder(organizationIdOf(req), req.body.testEmail))
    } catch (err) {
      sendError(res, err, 'Could not send the test reminder')
    }
  })
}
