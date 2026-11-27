# Database design review

Requested by Jalal: foreign keys, indexes, and UUID vs sequential ids. **Review only** — nothing in this
document has been applied. Based on `server/prisma/schema.prisma` (the introspected source of truth) and
every file in `supabase/migrations/`, cross-checked against the actual queries in `server/src/modules`.

## 1. Summary

- **42 tables** in `schema.prisma`, 41 of which are application data; the 42nd (`schema_migrations`) is just
  the ledger `npm run migrate` uses to track which `.sql` files have run.
- **Ids today**: every table uses `bigint generated always as identity` (Postgres identity columns, mapped
  by Prisma as `BigInt @id @default(autoincrement())`). Ids are sequential per table, start at 1, and are
  never reused. The one exception is `money_movements.group_id`, a `uuid` used only to tie a transfer's two
  rows (money out of one location, into another) together — not a primary key.
- **Company isolation** ("multi-tenant") is enforced two ways today:
  1. Almost every table carries an `organization_id` column, and every repository query filters by it
     (`WHERE ... AND organization_id = $1`) — this is **application-level** enforcement: the database does
     not know a request is scoped to one company, only that the code always asks it to be.
  2. For some (not all — see §2) relations that cross two tables which *both* carry `organization_id`, the
     database also enforces it directly with a **composite foreign key**: e.g.
     `foreign key (organization_id, project_id) references projects (organization_id, id)`. This is the
     pattern used by `estimates`, `invoices`, `payments`, `site_visits`, `project_members`, and several
     `money_movements` columns. It requires the parent table to have a `unique (organization_id, id)`
     constraint to point at, which is why it isn't used everywhere yet (see §2.3).
  A handful of tables (`project_assignments`, `work_assignments`, `work_entries`, `time_entries`,
  `supplier_agreements`, `attendance`, `day_off_requests`) have no `organization_id` column of their own at
  all — they only reach a company indirectly, through `employee_id` and/or `project_id`.

## 2. Foreign keys

### 2.1 Columns that look like a reference but have no foreign key

None found. Every `_id` column that points at another table's primary key does carry a real foreign key
constraint — this codebase is disciplined about that. (`money_movements.group_id` is not a reference, so it
correctly has no FK.)

### 2.2 `ON DELETE` behaviour — what happens when the parent is deleted

| Behaviour | Where | Effect |
|---|---|---|
| **CASCADE** | `auth_sessions.user_id`, `estimate_items/estimate_emails.estimate_id`, `invoice_items/invoice_emails.invoice_id`, `letter_emails.letter_id`, `receipt_emails.receipt_id`, `money_movement_revisions.money_movement_id`, `payment_revisions.payment_id` | Deleting the parent silently deletes these children too. |
| **CASCADE (flagged)** | `invoice_disbursements.invoice_id` | Same mechanism, different consequence — see below. |
| **RESTRICT** or **NO ACTION** (the default when a migration gives no `on delete` clause — Postgres blocks the delete either way) | Everything else: `employees`→`organization_members`, `app_users`→`employees`, and the whole chain of things that can reference a `client`/`project`/`invoice`/`estimate`/`payment`/`money_location` | The database refuses the delete outright (a plain Postgres error) while any child row still exists. |

**The one worth flagging**: `invoice_disbursements` is the only child of `invoices` that is **not**
protected the way `payments`, `receipts`, `invoice_payments`-via-`payments`, and
`projects_invoices_project_idToprojects` are. Every other "this represents real money" relationship into
`invoices` or out of `projects` uses `RESTRICT`/`NO ACTION` specifically so a project or invoice can't be
deleted while financial records about it still exist. `invoice_disbursements` — a record of money actually
paid out against a Client Funds invoice — instead uses `CASCADE`
(`supabase/migrations/20261010000000_client_funds_invoices.sql:46`), so deleting an invoice would silently
wipe out the disbursement history for it.

In today's app this is **not yet reachable**: there is no `DELETE /api/invoices/:id` route anywhere in
`server/src/modules` — only estimates, projects, letters, day-off-requests, and site-visits can be deleted
through the API, and none of those cascades into financial data the same way. So this is a **landmine for
later**, not a live bug: the day someone adds an "undo"/delete feature for invoices (or runs a manual
`DELETE FROM invoices` in a support situation), disbursement history disappears with it, with no warning.
Recommended fix in §5 (HIGH).

Every other `CASCADE` in the schema is a child whose only reason to exist is to describe or log its parent
(line items, sent-email records, revision history) — cascading those is correct and intentional.

### 2.3 Where the same-company rule is enforced only by code, not by the database

The composite-FK pattern from §1 is applied inconsistently. These columns point at another company-scoped
table but the database does **not** check that the two rows belong to the same company — only the
application's `WHERE organization_id = ...` on every query does:

| Table.column | Points at | Risk if the app ever gets this wrong (a bug, a bad migration, a manual `UPDATE`) |
|---|---|---|
| `money_movements.client_id` | `clients.id` | A money movement could be attributed to another company's client |
| `money_movements.employee_id` | `employees.id` | ...or another company's employee |
| `money_movements.invoice_id` | `invoices.id` | ...or another company's invoice |
| `money_movements.payment_id` | `payments.id` | ...or another company's payment |
| `payments.invoice_id` | `invoices.id` | A payment could be linked to another company's invoice |
| `letters.client_id`, `letters.project_id` | `clients.id`, `projects.id` | A letter could reference another company's client/project |
| `receipts.client_id`, `receipts.project_id`, `receipts.payment_id` | same | Same risk, on receipts |
| `day_off_requests.reviewed_by` | `app_users.id` | A different company's admin could end up recorded as the reviewer (low risk: the app always sets this to the current session's own user) |

Notably, `money_movements` is the table where this matters most — it's the one place every dollar in the
system eventually gets recorded — and it's also the table with the *most* columns missing this check
(4 of its 9 FK columns). By contrast, `category_id`, `location_id`, `project_id`, `supplier_id`, and
`to_location_id` on the very same table **do** have the composite check. This looks like the pattern was
adopted partway through `money_movements`'s life and never finished, rather than a deliberate choice.

Separately, five tables link an `employee_id` to a `project_id` with **no company check at all**, because
neither column has a sibling `organization_id` on that table to compose a check from:
`project_assignments`, `work_assignments`, `work_entries`, `time_entries`, `supplier_agreements`. Today
this is mitigated by every repository query reaching these tables by joining through `employees` or
`projects` and filtering on *their* `organization_id` — but the tables themselves would accept an
employee from company A assigned to a project from company B. Fixing this properly means giving these
tables their own `organization_id` column (the same "expand" migration pattern already used in
`20261026000000_organization_id_on_main_tables.sql`), then compositing against both parents. See §5
(MEDIUM).

## 3. Indexes

Checked against the actual `WHERE`/`JOIN`/`ORDER BY` clauses in `server/src/modules` (raw SQL for
time-tracking/assignments/payments/reminders/project-financials; Prisma for site-visits). Prioritised per
Jalal's growth list:

### `time_entries` — grows with every clock-in/clock-out and manual entry
- `WHERE employee_id = $1 AND started_at >= ... AND started_at < ...` (time-tracking.repository.ts) → covered by `time_entries_employee_started_idx (employee_id, started_at)`. Good.
- `WHERE employee_id = $1 AND ended_at IS NULL` → covered by the partial unique index `time_entries_one_active_per_employee`. Good.
- `WHERE status IN ('pending','rejected')` (pending-work.repository.ts) → covered by the partial index `@@index([status], where: status <> 'approved')`. Good.
- **Gap**: `WHERE project_id = $1 AND status = 'approved'` (projects.repository.ts:121) and
  `WHERE time_entries.status = 'approved' AND projects.organization_id = $1 [AND time_entries.project_id = $2]`
  (project-financials.repository.ts:34-36, the per-project/per-company labor-cost rollup) — **`project_id`
  has no index at all** on this table. Every cost summary for a project or a whole company currently does a
  full scan of `time_entries` filtered by `status`. This is the single biggest index gap on the busiest
  table. **HIGH priority**, see §5.

### `work_assignments` — grows with every admin-scheduled task
- `WHERE employee_id = $1 AND project_id = $2 AND start_date <= $3 AND end_date >= $3` (the overlap check, used in both `pending-work.repository.ts` and `time-tracking.repository.ts`)
- `WHERE projects.organization_id = $1 [AND work_assignments.project_id = ...] [AND work_assignments.employee_id = ...] ORDER BY start_date DESC, created_at DESC` (assignments.repository.ts)
- `WHERE project_id = $1 ORDER BY start_date` (projects.repository.ts:138)
- **This table has zero indexes beyond its primary key.** Every query above does a full table scan. It's
  one of the five tables Jalal specifically called out, and currently the worst-indexed one in the schema.
  **HIGH priority**, see §5.

### `site_visits` — new table (FEAT-04/04B/04C), will grow with every logged visit
- `WHERE organization_id = $1 AND visit_date BETWEEN ... [AND member_id = $2] [AND project_id = $3]` → the
  `(organization_id, visit_date)` and `(organization_id, member_id, visit_date)` indexes cover the
  month-only and month+person cases well. **Gap**: filtering "by project" (the `project_id` query param, and
  the FEAT-04C "By project" tab) has no matching index — it falls back to the `(organization_id,
  visit_date)` index plus a row-by-row filter on `project_id`. Low risk today (the table is brand new and
  small) but worth adding proactively since it's explicitly called out as a growth table. **LOW/MEDIUM**,
  see §5.

### `payments` — grows with every recorded payment
- `WHERE organization_id = $1 [AND project_id = $2] ORDER BY payment_date DESC, id DESC` (payments.repository.ts) → when a project filter is given, `payments_project_id_idx (project_id, payment_date)` covers it well. **Gap**: the plain "all of this company's payments" listing (no project filter) only has `@@index([organization_id])` — the `organization_id` filter is covered, but the `ORDER BY payment_date` is not, so Postgres must sort the matching rows itself instead of walking an index in order. **MEDIUM**, see §5.
- `WHERE invoice_id = $1 AND cancelled_at IS NULL` (the "amount already paid" check) → covered by `invoice_payments_invoice_id_idx (invoice_id, payment_date)`. Good.

### `reminder_runs` — Jalal's list, but turns out to need nothing
- The only queries are an `INSERT` and an `UPDATE ... WHERE organization_id = $1 AND run_date = $2`
  (reminders.repository.ts). The existing `@@unique([organization_id, run_date])` already covers both
  perfectly, and this table is naturally capped at **one row per company per day** — it will never become
  large. No action needed.

### Duplicate indexes (found by reading every migration, not just the current schema)
Six tables carry a plain `<table>_organization_id_idx` that is now fully redundant, because a *later*
migration gave the same table a composite index/constraint whose leading column is also `organization_id`
— and a multi-column index already serves any query that filters on just its first column:

| Table | Redundant index | Made redundant by | Added in |
|---|---|---|---|
| `categories` | `categories_organization_id_idx` | `categories_org_id_key` unique `(organization_id, id)`, `categories_name_key` unique `(organization_id, name)` | both in `20261027000000` |
| `clients` | `clients_organization_id_idx` | `clients_org_id_key` unique `(organization_id, id)` | `20261027000000` |
| `invoices` | `invoices_organization_id_idx` | `invoices_invoice_number_key` unique `(organization_id, invoice_number)` | same migration, `20261026000000` |
| `money_locations` | `money_locations_organization_id_idx` | `money_locations_org_id_key` unique `(organization_id, id)` | `20261027000000` |
| `projects` | `projects_organization_id_idx` | `projects_org_id_key` unique `(organization_id, id)` | `20261027000000` |
| `suppliers` | `suppliers_organization_id_idx` | `suppliers_org_id_key` unique `(organization_id, id)`, `suppliers_unique_name` unique `(organization_id, lower(trim(name)))` | same migration, `20261026000000` |

All six plain indexes were created in one bulk loop
(`supabase/migrations/20261026000000_organization_id_on_main_tables.sql:44`); the composite indexes/constraints
that superseded them were added the very next migration (or, for `invoices`/`suppliers`, in that same file a
few lines later) — this reads like an oversight rather than a deliberate choice. Dropping them costs
nothing in query performance and saves Postgres a write (and disk page) on every `INSERT`/`UPDATE`/`DELETE`
to these six tables. **LOW priority** (pure cleanup), see §5.

Every other table's indexing matches its queries reasonably well; `money_movements` (8 single-column
indexes, one per FK) and `estimates`/`invoices`/`letters`/`receipts` (indexed on every column a detail page
or list filters by) are in good shape and weren't flagged above.

## 4. UUID vs sequential ids

**Recommendation: keep `bigint` identity ids. Do not switch to UUID.**

Arguments for UUID generally are: (a) ids are unguessable, so exposing one in a URL doesn't leak "how many
rows exist" or let someone enumerate other rows; (b) ids can be generated client-side or merged across
databases without collision. Checked against this app specifically:

- **Ids do appear in URLs** (`/api/projects/:projectId`, `/api/site-visits/:id`, etc.), but **every one of
  those routes is already behind authentication and an `organization_id` scope check** on the query itself
  (`WHERE id = $1 AND organization_id = $2`, everywhere). There is no unauthenticated/"public" route in the
  codebase that relies on an id being hard to guess as its *only* protection. Guessing another company's
  bigint id today just gets a 404 from the existing org check — switching to UUID would not change what's
  actually protecting that data. (If a public, token-based share link is ever added — e.g. "email this
  invoice as a public link" — that should use its own random token column, not a UUID primary key, the same
  way a password-reset token works.)
- **Multi-company**: company isolation is already handled by the `organization_id` column, not by id
  shape. UUIDs wouldn't add isolation that doesn't already exist, and bigint ids being sequential per table
  (not globally) is not a problem here since nothing merges rows across companies by id.
- **Size**: a `bigint` is 8 bytes; a `uuid` is 16 — double the storage per id, and every foreign key column
  referencing it. On the biggest tables (`time_entries`, `money_movements`, `work_assignments` as they
  grow) that's real, compounding index bloat for no functional gain here.
- **Existing data**: every table, every FK, and the generated Prisma client all assume `bigint` today.
  There is no spare/parallel "dev" database to rehearse a re-key in (per `server/.env` pointing straight at
  production) — a PK type change would have to be done migration-by-migration, table-by-table, against the
  real database, re-pointing every FK as it goes, while the app stays live. That is a large, risky project
  for a problem this app doesn't actually have.
- **Prisma BigInt handling**: the codebase already has a working, consistent pattern for `BigInt` (every id
  is explicitly `.toString()`'d before going into a JSON response, and `BigInt(...)`'d coming back in; see
  any `*.repository.ts`'s `shapeX()` function). Switching to UUID wouldn't remove this kind of
  serialization work, just change its shape (UUIDs serialize to JSON natively as strings, so that part gets
  *slightly* simpler, but it's not a current pain point worth a migration of this size to fix).

**Cost if this were done anyway**: every one of the 42 tables' primary keys, every FK column pointing at
them (dozens, per §2), the Prisma schema, every `BigInt(...)` call-site in every `*.repository.ts`, every
zod `idString`/`optionalIdString` validator usage, and the client's id handling would all need to change
together, with no safe rehearsal environment. Not recommended unless a concrete new requirement (e.g.
public, authentication-free sharing by id) actually needs it — and even then, a separate random token
column is the narrower, lower-risk fix.

## 5. Prioritised recommendations

None of the SQL below has been run. Each statement is written to match this project's existing naming and
style conventions, for whoever applies it later to review and run through the normal migration process.

### HIGH

**H1 — Index `time_entries.project_id`** (busiest table with no index backing its per-project/per-company
cost rollups):
```sql
create index time_entries_project_status_idx on time_entries (project_id, status);
```

**H2 — Index `work_assignments`** (currently has no index at all beyond its primary key):
```sql
create index work_assignments_employee_dates_idx on work_assignments (employee_id, start_date, end_date);
create index work_assignments_project_dates_idx on work_assignments (project_id, start_date);
```

**H3 — Stop `invoice_disbursements` from being silently deleted with its invoice:**
```sql
-- Verify the constraint name first (it was created inline, so it's Postgres's default
-- "<table>_<column>_fkey" name — confirm with \d invoice_disbursements before running):
alter table invoice_disbursements drop constraint invoice_disbursements_invoice_id_fkey;
alter table invoice_disbursements add constraint invoice_disbursements_invoice_id_fkey
  foreign key (invoice_id) references invoices (id) on delete restrict;
```

### MEDIUM

**M1 — Close the `money_movements` same-company gap** (client_id/employee_id/invoice_id/payment_id are the
only 4 of its 9 FK columns without the composite check that category_id/location_id/project_id/supplier_id/
to_location_id already have). Needs a prerequisite `unique (organization_id, id)` on `employees`, `invoices`,
and `payments` first (the other three tables it needs already have one):
```sql
alter table employees add constraint employees_org_id_key unique (organization_id, id);
alter table invoices  add constraint invoices_org_id_key  unique (organization_id, id);
alter table payments  add constraint payments_org_id_key  unique (organization_id, id);

alter table money_movements add constraint money_movements_client_same_org
  foreign key (organization_id, client_id) references clients (organization_id, id);
alter table money_movements add constraint money_movements_employee_same_org
  foreign key (organization_id, employee_id) references employees (organization_id, id);
alter table money_movements add constraint money_movements_invoice_same_org
  foreign key (organization_id, invoice_id) references invoices (organization_id, id);
alter table money_movements add constraint money_movements_payment_same_org
  foreign key (organization_id, payment_id) references payments (organization_id, id);
```
(`add constraint` validates every existing row as part of the statement — if any row already crosses
companies, this fails loudly with that row's id, the same "fail loudly" approach already used in
`20261108000000_site_visits_by_member.sql`.)

**M2 — Close the same gap on `letters`, `receipts`, and `payments.invoice_id`** (reuses the constraints added in M1):
```sql
alter table letters add constraint letters_client_same_org
  foreign key (organization_id, client_id) references clients (organization_id, id);
alter table letters add constraint letters_project_same_org
  foreign key (organization_id, project_id) references projects (organization_id, id);

alter table receipts add constraint receipts_client_same_org
  foreign key (organization_id, client_id) references clients (organization_id, id);
alter table receipts add constraint receipts_project_same_org
  foreign key (organization_id, project_id) references projects (organization_id, id);
alter table receipts add constraint receipts_payment_same_org
  foreign key (organization_id, payment_id) references payments (organization_id, id);

alter table payments add constraint payments_invoice_same_org
  foreign key (organization_id, invoice_id) references invoices (organization_id, id);
```

**M3 — Give the employee↔project junction tables their own `organization_id`**, so a composite same-company
FK becomes possible on them too (today they have no column to compose one from). Representative example for
`project_assignments`; the identical pattern applies to `work_assignments`, `work_entries`, `time_entries`,
and `supplier_agreements`:
```sql
alter table project_assignments add column organization_id bigint;
update project_assignments set organization_id = (select organization_id from projects where projects.id = project_assignments.project_id);
alter table project_assignments alter column organization_id set not null;
alter table project_assignments add constraint project_assignments_employee_same_org
  foreign key (organization_id, employee_id) references employees (organization_id, id);
alter table project_assignments add constraint project_assignments_project_same_org
  foreign key (organization_id, project_id) references projects (organization_id, id);
create index project_assignments_organization_id_idx on project_assignments (organization_id);
```
This is a bigger, five-table change — worth scheduling deliberately rather than doing opportunistically.

### LOW

**L1 — Drop the six redundant `organization_id`-only indexes** (see §3's duplicate-index table):
```sql
drop index categories_organization_id_idx;
drop index clients_organization_id_idx;
drop index invoices_organization_id_idx;
drop index money_locations_organization_id_idx;
drop index projects_organization_id_idx;
drop index suppliers_organization_id_idx;
```

**L2 — Add a project-scoped index to `site_visits`** (proactive, table is new and currently small):
```sql
create index site_visits_org_project_date_idx on site_visits (organization_id, project_id, visit_date);
```

**L3 — Decide on `work_entries`**: the code already comments it as "legacy (v1 time tracking), left in place
but unreachable from the UI." It has no index either, but since nothing in the current UI queries it, that's
harmless. Worth a separate conversation about dropping the table entirely rather than indexing dead weight.

---

## Top findings (short version)

1. **`work_assignments` has no index at all** — every query against it (including the employee/project
   overlap check run on every new assignment) is a full table scan. Easy, safe fix (H2).
2. **`time_entries.project_id` has no index**, so the per-project and per-company labor-cost rollups scan
   the whole table. This is the table that will grow fastest. Easy, safe fix (H1).
3. **`invoice_disbursements` cascade-deletes with its invoice**, while every comparable financial child
   table (`payments`, `receipts`) is protected from exactly that. Not reachable today (no delete-invoice
   route exists yet), but a landmine for the next person who adds one (H3).
4. **`money_movements` enforces "same company" for 5 of its 9 relations but not the other 4** — the
   client/employee/invoice/payment links on this table aren't checked by the database at all, only by the
   app's `WHERE organization_id = ...` on every query (M1).
5. **Six indexes are pure dead weight** — `categories`, `clients`, `invoices`, `money_locations`, `projects`,
   and `suppliers` each carry a duplicate index that a later migration superseded and never removed (L1).
6. **UUID vs sequential ids**: recommend staying with `bigint`. Every route is already auth + company
   scoped, so id-guessing isn't actually a live risk here, and a re-key would be a large, risky project with
   no dev database to rehearse it in, for a problem this app doesn't have.
