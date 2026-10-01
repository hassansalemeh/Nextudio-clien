# UI verification harness

Drives the real app (real client build, real Express server, real browser) through its main flows and
asserts on the result — **without ever connecting to production**.

## What it does

1. Builds `server/` and `client/` for real (`npm run build` in each).
2. Starts an in-memory [PGlite](https://pglite.dev/) Postgres database and applies every migration in
   `supabase/migrations/`, in order.
3. Monkey-patches the `pg` module's `Pool` so every query the server makes goes to that in-memory database
   instead of a real connection. `DATABASE_URL` is set to a fake value that is never dialed.
4. Copies the built client into `server/public` (temporarily — deleted when the run ends) and boots the
   real `server/dist/app.js` on a random local port.
5. Drives it with a real, local, headless browser (Microsoft Edge or Google Chrome, via `playwright-core`)
   through the admin and employee flows: creating a client/project/employee, recording a payment, assigning
   work, approving a pending work entry, clocking in/out, saving an estimate and a Client Funds invoice,
   adding a disbursement, previewing PDFs, and switching between the admin and employee roles.
6. Reports which checks passed/failed, a route-by-route table (route, role, result), and any browser
   console errors, then closes everything down and deletes `server/public` again.

**Nothing here ever touches `server/.env` or a real Supabase/Postgres connection.** The database exists only
in this process's memory and is discarded when it exits.

## Running it

From the repo root:

```bash
node server/tools/test-harness/run-ui-verification.cjs
```

Requirements:
- `npm install` already run in both `server/` and `client/` (needs `pg`, `@electric-sql/pglite`, and
  `playwright-core` in `server/node_modules`).
- A local Chromium-based browser: Microsoft Edge or Google Chrome at their default Windows install paths.
  (Edit `EDGE_PATH`/`CHROME_PATH` at the top of the script if yours is installed elsewhere.)

Takes a minute or two: most of that is the two `npm run build` steps.

## Output

- Console: a running log of every check (`PASS`/`FAIL`), the route table, and any console errors, each
  tagged with the route that was open when it fired.
- `screenshots/` (git-ignored): one PNG per step, numbered in order, so a failure can be inspected visually.
- Exit code 0 if every check and every route passed with no console errors; 1 otherwise.

## Extending it

The script seeds only one admin login directly; everything else (clients, projects, employees, estimates,
invoices, work assignments...) is created by driving the real UI, since that's what's actually being
verified. Add new scenarios the same way: navigate with `page.getByRole('link', ...)`, scope a form with the
`cardByHeading()` helper when a page has more than one, assert on the resulting toast or empty-state text,
and call `recordRoute(route, role, ok, detail)` once per route you visit so it shows up in the final table.
