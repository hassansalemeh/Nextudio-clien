# Sending estimate emails with Resend

"Send by Email" on a quotation sends over HTTPS via the [Resend](https://resend.com) API — not SMTP. Railway
blocks outbound SMTP on our current plan (Nodemailer over SMTP failed with `ETIMEDOUT` / `ENETUNREACH` to
`smtp.gmail.com:465`), which an HTTPS API call doesn't run into. Nothing else about the feature changed: same
Send by Email dialog, same PDF attachment, same email history, same Draft → Pending behaviour.

## 1. Create a Resend account and API key
1. Sign up at resend.com (free tier: 3,000 emails/month, 100/day).
2. Settings → API Keys → Create API Key. Copy it once — you can't view it again.

## 2. Set the environment variables (Railway → Service → Variables)
| Name | Value |
|---|---|
| `RESEND_API_KEY` | the API key from step 1 (secret) |
| `MAIL_FROM_EMAIL` | `info@nextudio.co` (default if unset) |
| `MAIL_FROM_NAME` | `Nextudio Architects` (default if unset) |

Remove `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` if they're set — they're no longer used for anything.

Without `RESEND_API_KEY`, sending fails immediately with "Email is not configured..."; the estimate itself is
never affected.

## 3. Verify the nextudio.co domain in Resend (needed to send as info@nextudio.co)
Until the domain is verified, Resend only lets you send from its own shared test address
(`onboarding@resend.dev`) to the email address on your own Resend account — it will **reject** sending from
`info@nextudio.co` to a real client. To send as `info@nextudio.co`:

1. Resend dashboard → Domains → Add Domain → enter `nextudio.co`.
2. Resend will display a short list of DNS records to add — typically:
   - An **SPF** record: a `TXT` record (Resend may ask you to add it at the root, or combine it with an
     existing SPF record if `nextudio.co` already has one for another mail service).
   - One or more **DKIM** records: `TXT` records at a Resend-specific subdomain (commonly
     `resend._domainkey.nextudio.co` or similar — Resend generates this key pair per domain, so the exact
     host and value only exist once you add the domain).
   - Optionally a **DMARC** `TXT` record at `_dmarc.nextudio.co` (Resend usually recommends one; it isn't
     required for sending to succeed, but improves deliverability and is good practice).
3. Add exactly what Resend shows (host, type, value) in GoDaddy → nextudio.co → DNS Management → Add Record.
4. Back in Resend, click "Verify DNS Records" (propagation is usually minutes, occasionally longer).

**I haven't invented values for these records** — Resend generates the DKIM key and exact record names only
after you add the domain in your account, so I can't know them in advance. Once you add the domain, paste me
what Resend shows and I'll tell you precisely what to put in GoDaddy (or you can add it directly — it's a
plain TXT record).

## 4. Test it
Once `RESEND_API_KEY` is set (domain verification only needed to send as `info@nextudio.co` to real clients,
not to send at all), open an estimate → Send by Email → send it to an address you control, and confirm it
arrives with the quotation PDF attached.
