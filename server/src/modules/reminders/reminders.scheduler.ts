import { describeError } from '../../shared'
import { runScheduledReminders } from './reminders.service'

const CHECK_INTERVAL_MS = 60_000

// The first and only scheduled job in this app: checked every minute rather than fired at one exact
// instant, so a brief restart around the reminder window doesn't just silently miss the day (the once-per-
// day guarantee itself lives in reminders.repository's reminder_runs claim, not here).
export function startReminderScheduler(): void {
  const timer = setInterval(() => {
    runScheduledReminders().catch((err) => {
      console.error('[reminders] scheduler tick failed:', describeError(err))
    })
  }, CHECK_INTERVAL_MS)
  timer.unref() // never keeps the process alive on its own
}
