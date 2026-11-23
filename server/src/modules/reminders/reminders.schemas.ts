import { z } from 'zod'
import { email } from '../../shared'

export const sendTestReminderBody = z.object({ testEmail: email('test email address') })
