import { describeError, HttpError, isWeekend, nowTimeInCompanyTimezone, sendMail, todayInCompanyTimezone } from '../../shared'
import { reminderEmailHtml, reminderEmailText } from './reminders.email'
import * as remindersRepository from './reminders.repository'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// HH:MM, 24h, Asia/Beirut time - the window the reminder is allowed to send in. If the server is down for
// the whole window, that day is marked "missed" instead of sending a late reminder once it comes back.
function reminderStartTime(): string {
  return process.env.REMINDER_TIME || '17:30'
}
function reminderEndTime(): string {
  return process.env.REMINDER_END_TIME || '19:00'
}

function publicUrl(): string {
  return (process.env.PUBLIC_URL ?? '').replace(/\/$/, '')
}
function workUrl(): string {
  return `${publicUrl()}/`
}
function logoUrl(): string {
  return `${publicUrl()}/nextudio-logo.webp`
}

export type SkipReason = 'already_submitted' | 'day_off' | 'inactive' | 'missing_contact_email'
const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  already_submitted: 'already logged work today',
  day_off: 'has an approved day off today',
  inactive: 'inactive',
  missing_contact_email: 'missing contact email',
}

export type ReminderOutcome = {
  reminded: { id: string; name: string; email: string }[]
  skipped: { id: string; name: string; reason: SkipReason }[]
}

// Who needs a reminder today, for one organization, and why everyone else doesn't. Shared by the real
// scheduled send and the manual preview/test trigger, so what a dry run shows and what actually gets sent
// can never drift apart. Checked in this order: inactive employees are skipped regardless of anything else;
// then already-submitted (pending counts as submitted); then an approved day off; then a missing address.
async function computeReminderOutcome(organizationId: string, dateString: string): Promise<ReminderOutcome> {
  const employees = await remindersRepository.selectEmployeesForReminderCheck(organizationId, dateString)
  const reminded: ReminderOutcome['reminded'] = []
  const skipped: ReminderOutcome['skipped'] = []
  for (const employee of employees) {
    const base = { id: employee.id, name: employee.full_name }
    if (!employee.is_active) {
      skipped.push({ ...base, reason: 'inactive' })
    } else if (employee.has_entry_today) {
      skipped.push({ ...base, reason: 'already_submitted' })
    } else if (employee.has_approved_day_off) {
      skipped.push({ ...base, reason: 'day_off' })
    } else if (!employee.contact_email) {
      skipped.push({ ...base, reason: 'missing_contact_email' })
    } else {
      reminded.push({ ...base, email: employee.contact_email })
    }
  }
  return { reminded, skipped }
}

async function sendReminderEmail(name: string, email: string): Promise<void> {
  await sendMail({
    to: email,
    subject: 'Reminder: submit your work for today',
    text: reminderEmailText(name, workUrl()),
    html: reminderEmailHtml(name, workUrl(), logoUrl()),
  })
}

// The scheduled run for one organization, called every minute by the scheduler. A no-op unless it's a
// weekday, the window is open (or just closed), and today hasn't already been claimed by this or another
// instance - so calling it repeatedly is always safe.
export async function runScheduledReminderForOrganization(organizationId: string, organizationName: string): Promise<void> {
  const date = todayInCompanyTimezone()
  if (isWeekend(date)) return

  const now = nowTimeInCompanyTimezone()
  if (now < reminderStartTime()) return // window hasn't opened yet

  if (now > reminderEndTime()) {
    const claimed = await remindersRepository.claimReminderRun(organizationId, date, 'missed_window')
    if (claimed) console.log(`[reminders] ${organizationName} ${date}: window closed before the server could run - skipped`)
    return
  }

  const claimed = await remindersRepository.claimReminderRun(organizationId, date, 'sent')
  if (!claimed) return // already claimed today, by this or another instance

  const outcome = await computeReminderOutcome(organizationId, date)
  let sentCount = 0
  for (const person of outcome.reminded) {
    try {
      await sendReminderEmail(person.name, person.email)
      sentCount += 1
      console.log(`[reminders] ${organizationName} ${date}: reminded ${person.name} (${person.email})`)
    } catch (err) {
      console.error(`[reminders] ${organizationName} ${date}: failed to email ${person.name} (${person.email}):`, describeError(err))
    }
  }
  for (const person of outcome.skipped) {
    console.log(`[reminders] ${organizationName} ${date}: skipped ${person.name} - ${SKIP_REASON_LABEL[person.reason]}`)
  }
  console.log(`[reminders] ${organizationName} ${date}: reminded ${sentCount}/${outcome.reminded.length}, skipped ${outcome.skipped.length}`)
  await remindersRepository.completeReminderRun(organizationId, date, sentCount, outcome.skipped.length)
}

export async function runScheduledReminders(): Promise<void> {
  const organizations = await remindersRepository.selectOrganizations()
  for (const organization of organizations) {
    try {
      await runScheduledReminderForOrganization(organization.id, organization.name)
    } catch (err) {
      console.error(`[reminders] ${organization.name}: run failed:`, describeError(err))
    }
  }
}

// ---- Manual trigger (admin only, for testing) ----
// Neither of these ever touches reminder_runs, so testing on demand can never consume or interfere with
// the scheduled run's once-per-day claim.

export type ManualReminderResult = ReminderOutcome & { date: string; sentTo?: string }

// Dry run: who would be reminded and who would be skipped (and why), right now. Sends nothing.
export async function previewReminders(organizationId: string): Promise<ManualReminderResult> {
  const date = todayInCompanyTimezone()
  return { date, ...(await computeReminderOutcome(organizationId, date)) }
}

// Sends exactly one real reminder email, to the given test address only - never to an employee's
// contact_email. Still returns the same breakdown as a preview, so the admin can see who the real send
// would have reached.
export async function sendTestReminder(organizationId: string, testEmail: unknown): Promise<ManualReminderResult> {
  if (typeof testEmail !== 'string' || !EMAIL_RE.test(testEmail.trim())) {
    throw new HttpError(400, 'Enter a valid test email address')
  }
  const address = testEmail.trim()
  const date = todayInCompanyTimezone()
  const outcome = await computeReminderOutcome(organizationId, date)
  await sendReminderEmail('there', address)
  return { date, ...outcome, sentTo: address }
}
