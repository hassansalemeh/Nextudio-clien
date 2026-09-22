// Sends email from the server only. Credentials live in environment variables (SMTP_HOST/PORT/USER/PASS) and are
// never sent to the browser. Configure a real provider by setting those variables; nothing here hardcodes one.
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { describeError, HttpError } from './http'

// describeError() already redacts DATABASE_URL and session secrets; this also strips SMTP_PASS/SMTP_USER,
// in case a mail-server error ever echoes them back (some SMTP servers include the failed AUTH line).
export function redactCredentials(text: string): string {
  let redacted = text
  for (const secret of [process.env.SMTP_PASS, process.env.SMTP_USER]) {
    if (secret && secret.length >= 3) redacted = redacted.split(secret).join('***')
  }
  return redacted
}

export type MailAttachment = { filename: string; content: Buffer; contentType?: string }
export type MailMessage = {
  to: string
  cc?: string | null
  subject: string
  text: string
  attachments?: MailAttachment[]
}

function transporterFromEnv(): Transporter | null {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false (STARTTLS) for 587/25
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  })
}

let setupPromise: Promise<{ transporter: Transporter; isTestAccount: boolean }> | null = null

function setupTransporter() {
  if (!setupPromise) {
    setupPromise = (async () => {
      const fromEnv = transporterFromEnv()
      if (fromEnv) return { transporter: fromEnv, isTestAccount: false }

      if (process.env.NODE_ENV === 'production') {
        throw new HttpError(
          500,
          'Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in the server environment.'
        )
      }

      // Development only: a free, disposable Ethereal mailbox (nodemailer's own test SMTP service). Nothing is
      // delivered to a real inbox; the message can only be viewed through the preview URL this logs to the console.
      const account = await nodemailer.createTestAccount()
      console.warn(
        `[mail] SMTP_HOST is not set, so a temporary Ethereal test mailbox is being used for local testing only ` +
          `(${account.user}). Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS to send real email.`
      )
      const transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      })
      return { transporter, isTestAccount: true }
    })()
    setupPromise.catch(() => {
      setupPromise = null
    })
  }
  return setupPromise
}

// Resolves once the message is accepted by the mail server; throws (never returns a "failed" value) otherwise.
// testPreviewUrl is only set when no real provider is configured (see setupTransporter above).
export async function sendMail(message: MailMessage): Promise<{ testPreviewUrl: string | null }> {
  const { transporter, isTestAccount } = await setupTransporter()
  const fromEmail = process.env.MAIL_FROM_EMAIL || 'info@nextudio.co'
  const fromName = process.env.MAIL_FROM_NAME || 'Nextudio Architects'

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: message.to,
      cc: message.cc || undefined,
      subject: message.subject,
      text: message.text,
      attachments: message.attachments,
    })
    const testPreviewUrl = isTestAccount ? nodemailer.getTestMessageUrl(info) || null : null
    if (testPreviewUrl) console.log('[mail] test message preview:', testPreviewUrl)
    return { testPreviewUrl }
  } catch (err) {
    if (err instanceof HttpError) throw err
    console.error('[mail] send failed:', redactCredentials(describeError(err)))
    throw new HttpError(502, 'The mail server rejected the message. Please try again or check the email settings.')
  }
}
