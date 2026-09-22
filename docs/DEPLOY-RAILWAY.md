# Deploying Nextudio Control on Railway

The app runs as one Docker container (website + API + Chromium for PDFs). The database stays on Supabase, unchanged.

## 1. Create the service
1. Railway → New Project → Deploy from GitHub repo (or `railway up`). Railway finds `railway.json` and builds the `Dockerfile`.
2. Health check is preconfigured: `/api/health` (returns `{"status":"ok","database":"ok"}` only when the database answers).

## 2. Variables (Service → Variables)
| Name | Value |
|---|---|
| `DATABASE_URL` | the existing Supabase connection string (session pooler) |
| `PUBLIC_URL` | `https://control.nextudio.co` |
| `STANDARD_MONTHLY_HOURS` | `176` |

Do **not** set `PORT`: Railway provides it and the app listens on `process.env.PORT`.
`NODE_ENV`, `PDF_BROWSER_PATH` and `PDF_NO_SANDBOX` are already set inside the image.

To enable "Send by Email" on quotations, set `RESEND_API_KEY` (from the [Resend](https://resend.com) dashboard)
and optionally `MAIL_FROM_EMAIL` (default `info@nextudio.co`) and `MAIL_FROM_NAME` (default `Nextudio Architects`).
Email is sent over HTTPS via the Resend API, not SMTP — **Railway blocks outbound SMTP on our plan**, which is
why this doesn't use `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` at all. Without `RESEND_API_KEY`, sending
fails with a clear error; nothing else is affected. See `docs/EMAIL-RESEND.md` for full setup, including the
DNS records `nextudio.co` needs for Resend to send as `info@nextudio.co`.

## 3. Domain
Service → Settings → Networking → Custom Domain → `control.nextudio.co`. Add the CNAME record Railway shows at your DNS provider. HTTPS is issued automatically.

## 4. First deploy only: mark the existing schema as applied
The Supabase database already has all tables, so run once (Railway shell / `railway run`):

    node dist/scripts/migrate.js --baseline

Later releases: `node dist/scripts/migrate.js` applies only new migration files.

## 5. Verify
- `https://control.nextudio.co/api/health` → `{"status":"ok","database":"ok"}`
- Log in, open an estimate/invoice preview and download the PDF.
- Everyone must log in again once (sessions are now server-side cookies).

## Operations
- Logs: Railway → Deployments → View logs (errors never include passwords, tokens or the connection string).
- Diagnostics: `node dist/scripts/check.js` in the Railway shell.
- Backup: `node dist/scripts/backup.js` (writes JSON; copy it off the container, as container files are not persistent). Restore: `node dist/scripts/restore.js`.
- Create a user: `node dist/scripts/create-user.js`.
