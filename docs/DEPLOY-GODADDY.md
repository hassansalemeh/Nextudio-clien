# Deploying Nextudio Control on GoDaddy Node.js hosting

Target address: **https://control.nextudio.co** (a subdomain; the main nextudio.co website is not touched).

The package you upload is one folder that contains BOTH the website and the server. The server serves the website, so
there is one address, no separate front-end host, and no cross-site settings.

```
app.js            startup file for cPanel (starts the server)
package.json      what to install and the commands (npm start, npm run check, ...)
dist/             the compiled server
public/           the built website (served by the server)
assets/           the logo used on PDFs
migrations/       the database migration files
.env.example      the NAMES of the environment variables (no secrets)
```

The database is **PostgreSQL on Supabase** (there is no MongoDB anywhere in this application). It stays where it is;
the hosted app connects to it over an encrypted connection.

---------------------------------------------------------------------------------------------------------------------

## 0. Before anything else: make a backup (on your own computer)

From the project folder on your computer: `cd server`, set `DATABASE_URL` in server/.env, then run
`npx tsx src/scripts/backup.ts`. A file appears in `server/backups/` (or `backups/` where you run it). Keep it private (it
contains password hashes). See section 7. (On the host the same thing is `npm run backup`.)

## 1. Create the subdomain

cPanel > **Domains** (or Subdomains) > Create: `control` on `nextudio.co`.
Creating a subdomain does not change nextudio.co. If nextudio.co's DNS is at GoDaddy this also creates the DNS record; if
the DNS is somewhere else, add an `A` record for `control` pointing to the hosting IP shown in cPanel.

## 2. Upload the package

1. cPanel > File Manager. Go to your HOME folder (not public_html) and create a folder `control-app`.
2. Upload `nextudio-control-YYYY-MM-DD.zip` into it and **Extract** it there.
3. Do not upload `node_modules` or any `.env` file.

## 3. Create the Node.js application

cPanel > **Setup Node.js App** > **Create Application**:

| Field                    | Value                                        |
|--------------------------|----------------------------------------------|
| Node.js version          | the newest offered (must be 18 or newer)     |
| Application mode         | Production                                   |
| Application root         | `control-app`                                |
| Application URL          | `control.nextudio.co`                        |
| Application startup file | `app.js`                                     |

Then in the **Environment variables** section add the variables from `.env.example` (section 8). At minimum
`NODE_ENV`, `DATABASE_URL`, `PUBLIC_URL`, `STANDARD_MONTHLY_HOURS`. Do not add `PORT`: the host provides it.

Click **Run NPM Install**, then **Restart**.

## 4. HTTPS

cPanel > **SSL/TLS Status** > run AutoSSL for `control.nextudio.co` (a free certificate). Then in cPanel > Domains turn on
**Force HTTPS Redirect** for the subdomain. The application also refuses plain HTTP by itself when the host tells it a
request was HTTP, and tells browsers to use HTTPS only.

## 5. Check that it works

1. Open https://control.nextudio.co/api/health : it must show `{"status":"ok"}`.
2. Open https://control.nextudio.co and log in with an existing account. Refresh on `/dashboard`: the page must stay.
3. Run the environment check. cPanel > Setup Node.js App > your app > **Run JS script** > `check`, or by SSH:
   `cd ~/control-app`, enter the app's virtual environment (the Node.js App page shows the exact command), `npm run check`.
   It reports Node version, environment variables (names only), the database connection and whether it is encrypted,
   whether the latest tables exist, and **whether PDFs can be produced on this host**.
4. If `check` says the database is untracked, run once `npm run migrate -- --baseline` (records that the existing schema is
   up to date), then `npm run migrate:status`.

### About PDFs on this hosting
Quotation and invoice PDFs are produced by Chrome/Edge running invisibly on the server. Shared hosting usually does not
provide a browser and does not allow installing one. `npm run check` (step 3) tells you for certain. If it reports that PDF
generation does not work, everything else still works, only Preview / Download PDF fail with a clear message. Then choose:
a VPS or cloud host that allows Chromium, or ask for the PDF engine to be replaced with one that needs no browser.

> **Everyone must log in again once** after this version goes live (login sessions moved to a secure cookie).

## 6. Restarting and updating

* **Restart:** Setup Node.js App > **Restart**. (Or, by file: create/update `control-app/tmp/restart.txt`.)
* **Update to a new version:** make a backup first; upload the new ZIP into `control-app` and extract over the old files;
  **Run NPM Install** if package.json changed; run `npm run migrate` (applies only new migrations); **Restart**.
* **Logs:** errors and one line per API request are written to the app's log (Passenger's `stderr.log` / the log link on the
  Setup Node.js App page). Users never see error details; you do, here.

## 7. Backup and restore

**Back up** (run from any machine that has the project and the `DATABASE_URL` in its environment, or on the host):

    npm run backup              # creates backups/nextudio-YYYY-MM-DD-HHMMSS.json

The file holds all data (clients, employees, projects, time entries, estimates, invoices, payments, accounts). Store it
somewhere private (not in git, not shared). Make one before every update.

**Check a backup without changing anything:**

    npm run restore -- backups/FILE.json --dry-run

**Restore into a new, empty database** (for example after a disaster, or to move to another database):

    1. Point DATABASE_URL at the empty database
    2. npm run migrate                       (creates the empty tables)
    3. npm run restore -- backups/FILE.json  (loads everything; refuses if the tables are not empty)

**Restore over the current data** (destructive, replaces everything with the backup):

    npm run restore -- backups/FILE.json --wipe --confirm=YES

A restore runs inside one transaction: if anything is wrong nothing is changed. Supabase also keeps its own automatic
backups (see your Supabase project > Database > Backups); the command above is your own copy.

## 8. Environment variables

| Name                     | Secret? | Meaning                                                                          |
|--------------------------|---------|----------------------------------------------------------------------------------|
| `NODE_ENV`               | no      | `production`                                                                     |
| `DATABASE_URL`           | **YES** | Supabase PostgreSQL connection string (contains the database password)          |
| `PUBLIC_URL`             | no      | `https://control.nextudio.co`                                                    |
| `STANDARD_MONTHLY_HOURS` | no      | hours per month used for hourly labor cost (176 unless the company says otherwise)|
| `PDF_BROWSER_PATH`       | no      | optional: full path of Chrome/Chromium for PDFs                                  |
| `PDF_NO_SANDBOX`         | no      | optional: `true` if Chrome will not start without it                             |
| `DATABASE_CA_CERT`       | no      | optional: database CA certificate to also verify the database server             |
| `DB_POOL_MAX`            | no      | optional: max simultaneous database connections (default 5)                      |
| `DATABASE_SSL`           | no      | optional: the database connection is encrypted by default; `false` only for a local database |
| `TRUST_PROXY`, `COOKIE_SECURE`, `FORCE_HTTPS` | no | optional tuning, defaults are right for production            |

There are **no other secrets**. Login sessions are random tokens stored (hashed) in the database, so there is no session
secret to keep. Passwords are stored only as salted scrypt hashes. Keep safe: `DATABASE_URL`, and any backup files.

## 9. Rolling back

Keep the previous ZIP. To go back: upload and extract the previous ZIP over the files, **Restart**. If a new migration was
applied and must be undone, restore the backup you made before updating (section 7).

## 10. Security features included

* Login throttling: 5 failed attempts per email and 20 attempts per address in 15 minutes, then a wait.
* Session in an HttpOnly, Secure, SameSite=Strict cookie; server-side sessions that expire after 7 days.
* Admin/Employee permissions enforced on the server for every API route (employees get 403 on admin URLs).
* HTTPS enforced, HSTS, no server version header, no stack traces to users.
* The one-off data scripts used during setup are NOT in the package.
