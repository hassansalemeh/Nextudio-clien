// Sends email from the server only, over HTTPS via the Resend API (https://resend.com/docs/api-reference/emails/send-email).
// Credentials live in environment variables and are never sent to the browser. No SMTP: Railway blocks outbound
// SMTP on our plan (ETIMEDOUT / ENETUNREACH to smtp.gmail.com:465), which is exactly what an HTTPS API avoids.
import { describeError, HttpError } from './http'

export type MailAttachment = { filename: string; content: Buffer; contentType?: string }
export type MailMessage = {
  to: string
  cc?: string | null
  subject: string
  text: string
  attachments?: MailAttachment[]
}

// Overridable only so local tests can point requests at a mock server instead of the real API; production
// never needs to set this.
const RESEND_API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails'

// describeError() already redacts DATABASE_URL and session secrets; this also strips the Resend API key, in
// case a provider error response or a network error message ever echoed it back.
export function redactCredentials(text: string): string {
  const key = process.env.RESEND_API_KEY
  return key && key.length >= 3 ? text.split(key).join('***') : text
}

function splitAddresses(value: string): string[] {
  return value
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)
}

function describeResendFailure(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; name?: string }
    if (parsed?.message) return `The email provider rejected the message: ${parsed.message}`
  } catch {
    // body wasn't JSON; fall through to a generic message below
  }
  if (status === 401 || status === 403) return 'The email provider rejected the request. Check that RESEND_API_KEY is set correctly.'
  if (status === 422) return 'The email provider rejected the message (check the sender address and that the domain is verified).'
  return 'The mail server rejected the message. Please try again or check the email settings.'
}

// Resolves once Resend accepts the message; throws HttpError otherwise. Never silently "succeeds" on failure.
export async function sendMail(message: MailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new HttpError(
      500,
      'Email is not configured. Set RESEND_API_KEY (and optionally MAIL_FROM_EMAIL / MAIL_FROM_NAME) in the server environment.'
    )
  }

  const fromEmail = process.env.MAIL_FROM_EMAIL || 'info@nextudio.co'
  const fromName = process.env.MAIL_FROM_NAME || 'Nextudio Architects'

  const payload: Record<string, unknown> = {
    from: `${fromName} <${fromEmail}>`,
    to: splitAddresses(message.to),
    subject: message.subject,
    text: message.text,
  }
  if (message.cc) payload.cc = splitAddresses(message.cc)
  if (message.attachments?.length) {
    // Resend's HTTP API takes each attachment's content as a base64 string
    payload.attachments = message.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content.toString('base64'),
    }))
  }

  let response: Response
  try {
    response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[mail] could not reach the email provider:', redactCredentials(describeError(err)))
    throw new HttpError(502, 'Could not reach the email provider. Please try again.')
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(`[mail] Resend rejected the message (HTTP ${response.status}):`, redactCredentials(body))
    throw new HttpError(502, describeResendFailure(response.status, body))
  }
}
