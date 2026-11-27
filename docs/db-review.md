# Database design review

Requested by Jalal: foreign keys, indexes, and UUID vs sequential ids. **Review only** — nothing in this
document has been applied. Based on `server/prisma/schema.prisma` (the introspected source of truth) and
every file in `supabase/migrations/`, cross-checked against the actual queries in `server/src/modules`.

*Revision note:* every factual claim below (every "no index", "duplicate index", "no FK", and "ON DELETE"
statement) was re-verified line-by-line against both `schema.prisma` and the migration files after the
first draft got one finding wrong — `work_assignments` does have an index (on `project_id`), it just needed
a different one (on `employee_id`). That correction, two wrong migration-file attributions in the
duplicate-index table, a missed seventh duplicate index (`estimates`), and one inaccurate summary line (not
every table uses a `bigint` id — `auth_sessions` doesn't) are fixed in this version, and a `file:line`
citation has been added next to each finding so it can be checked directly.

## 1. Summary

- **42 tables** in `schema.prisma` (counted directly from the file), 41 of which are application data; the
  42nd (`schema_migrations`) is just the ledger `npm run migrate` uses to track which `.sql` files have run.
- **Ids today**: every table except two uses `bigint generated always as identity` (Postgres identity
  columns, mapped by Prisma as `BigInt @id @default(autoincrement())`) — sequential per table, starting at
  1, never reused. The two exceptions: `auth_sessions`, whose primary key is `token_hash text primary key`
  (a session token hash, not a counter — `supabase/migrations/20260924000000_create_auth.sql:19`,
  `schema.prisma:69`), and the `schema_migrations` ledger itself, keyed by `filename` (`schema.prisma:830`).
  Separately, `money_movements.group_id` is a `uuid` column used only to tie a transfer's two rows (money
  out of one location, into another) together (`schema.prisma:489`) — not a primary key, and not part of
  either exception above.
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

None found. Checked every `_id`/`_by` column in all 42 models in `schema.prisma` against its relations —
every one that points at another table's primary key carries a real foreign key constraint. (Verification
method: every model was read in full; a column is only "missing" an FK if no `@relation(fields: [that
column], ...)` exists anywhere in the file. `money_movements.group_id` — `schema.prisma:489` — is not a
reference, so it correctly has no FK.)

### 2.2 `ON DELETE` behaviour — what happens when the parent is deleted

Every `CASCADE` below is explicit in `schema.prisma` (Prisma only emits `onDelete: Cascade` when the actual
database constraint says so — it is never the default), so each is independently confirmed against the file:

| Behaviour | Where | Source | Effect |
|---|---|---|---|
| **CASCADE** | `auth_sessions.user_id` | `schema.prisma:75` | Deleting the parent silently deletes these children too. |
| **CASCADE** | `estimate_emails.estimate_id` | `schema.prisma:205` | — |
| **CASCADE** | `estimate_items.estimate_id` | `schema.prisma:223` | — |
| **CASCADE** | `invoice_emails.invoice_id` | `schema.prisma:313` | — |
| **CASCADE** | `invoice_items.invoice_id` | `schema.prisma:331` | — |
| **CASCADE** | `letter_emails.letter_id` | `schema.prisma:408` | — |
| **CASCADE** | `receipt_emails.receipt_id` | `schema.prisma:764` | — |
| **CASCADE** | `money_movement_revisions.money_movement_id` | `schema.prisma:470` | — |
| **CASCADE** | `payment_revisions.payment_id` | `schema.prisma:596` | — |
| **CASCADE (flagged)** | `invoice_disbursements.invoice_id` | `schema.prisma:294`, migration below | Same mechanism, different consequence — see below. |
| **RESTRICT** or **NO ACTION** (no `on delete` clause, or an explicit `Restrict`/`NoAction` — Postgres blocks the delete either way) | Everything else: `app_users.employee_id` (`schema.prisma:36`), `employees.organization_member_id` (`schema.prisma:181`), and the whole chain of things that can reference a `client`/`project`/`invoice`/`estimate`/`payment`/`money_location` (e.g. `estimates.client_id:268`, `invoices.project_id:384`, `letters.client_id:431`/`project_id:433`, `money_movements.*:499-511`, `payments.invoice_id:620`, `receipts.client_id:800`/`payment_id:803`/`project_id:804`) | — | The database refuses the delete outright (a plain Postgres error) while any child row still exists. |

**The one worth flagging**: `invoice_disbursements` is the only child of `invoices` that is **not**
protected the way `payments`, `receipts`, `invoice_payments`-via-`payments`, and
`projects_invoices_project_idToprojects` are. Every other "this represents real money" relationship into
`invoices` or out of `projects` uses `RESTRICT`/`NO ACTION` specifically so a project or invoice can't be
deleted while financial records about it still exist. `invoice_disbursements` — a record of money actually
paid out against a Client Funds invoice — instead uses `CASCADE`
(`supabase/migrations/20261010000000_client_funds_invoices.sql:46`: `invoice_id bigint not null references
invoices(id) on delete cascade`, matching `schema.prisma:294`), so deleting an invoice would silently wipe
out the disbursement history for it.

In today's app this is **not yet reachable**: grepping `server/src/modules` for `app.delete(` finds only six
routes — `day-off-requests.routes.ts:105`, `disbursements.routes.ts:48` (deletes one disbursement row, not an
invoice), `estimates.routes.ts:104`, `letters.routes.ts:68`, `projects.routes.ts:61`, and
`site-visits.routes.ts:94`. There is no `DELETE /api/invoices/:id` (or `/api/payments/:id`,
`/api/receipts/:id`) route at all. So this is a **landmine for later**, not a live bug: the day someone adds
an "undo"/delete feature for invoices (or runs a manual `DELETE FROM invoices` in a support situation),
disbursement history disappears with it, with no warning. Recommended fix in §5 (HIGH).

Every other `CASCADE` in the schema is a child whose only reason to exist is to describe or log its parent
(line items, sent-email records, revision history) — cascading those is correct and intentional.

### 2.3 Where the same-company rule is enforced only by code, not by the database

The composite-FK pattern from §1 is applied inconsistently. These columns point at another company-scoped
table but the database does **not** check that the two rows belong to the same company — only the
application's `WHERE organization_id = ...` on every query does:

| Table.column | Points at | Source (confirms no composite `(organization_id, X)` FK exists) | Risk if the app ever gets this wrong (a bug, a bad migration, a manual `UPDATE`) |
|---|---|---|---|
| `money_movements.client_id` | `clients.id` | `schema.prisma:499` — only a plain `fields: [client_id]` relation | A money movement could be attributed to another company's client |
| `money_movements.employee_id` | `employees.id` | `schema.prisma:501` | ...or another company's employee |
| `money_movements.invoice_id` | `invoices.id` | `schema.prisma:502` | ...or another company's invoice |
| `money_movements.payment_id` | `payments.id` | `schema.prisma:506` | ...or another company's payment |
| `payments.invoice_id` | `invoices.id` | `schema.prisma:620` | A payment could be linked to another company's invoice |
| `letters.client_id`, `letters.project_id` | `clients.id`, `projects.id` | `schema.prisma:431`, `:433` | A letter could reference another company's client/project |
| `receipts.client_id`, `receipts.project_id`, `receipts.payment_id` | same | `schema.prisma:800`, `:804`, `:803` | Same risk, on receipts |
| `day_off_requests.reviewed_by` | `app_users.id` | `schema.prisma:136`; `day_off_requests` has no `organization_id` column at all | A different company's admin could end up recorded as the reviewer (low risk: the app always sets this to the current session's own user) |

Notably, `money_movements` is the table where this matters most — it's the one place every dollar in the
system eventually gets recorded — and it's also the table with the *most* columns missing this check
(4 of its 9 FK columns: `client_id`, `employee_id`, `invoice_id`, `payment_id` — `schema.prisma:499-506`).
By contrast, `category_id` (`:498`), `location_id` (`:504`), `project_id` (`:508`), `supplier_id` (`:510`),
and `to_location_id` (`:512`) on the very same table **do** have the composite check. This looks like the
pattern was adopted partway through `money_movements`'s life and never finished, rather than a deliberate
choice.

Separately, five tables link an `employee_id` to a `project_id` with **no company check at all**, because
neither column has a sibling `organization_id` on that table to compose a check from — confirmed by reading
each model in full and finding no `organization_id` field: `project_assignments` (`schema.prisma:634-644`),
`work_assignments` (`:926-938`), `work_entries` (`:942-953`), `time_entries` (`:906-922`),
`supplier_agreements` (`:872-881`). Today this is mitigated by every repository query reaching these tables
by joining through `employees` or `projects` and filtering on *their* `organization_id` — but the tables
themselves would accept an employee from company A assigned to a project from company B. Fixing this
properly means giving these tables their own `organization_id` column (the same "expand" migration pattern
already used in `20261026000000_organization_id_on_main_tables.sql:40-44`), then compositing against both
parents. See §5 (MEDIUM).

## 3. Indexes

Checked against the actual `WHERE`/`JOIN`/`ORDER BY` clauses in `server/src/modules` (raw SQL for
time-tracking/assignments/payments/reminders/project-financials; Prisma for site-visits). Prioritised per
Jalal's growth list:

### `time_entries` — grows with every clock-in/clock-out and manual entry
- `WHERE employee_id = $1 AND started_at >= ... AND started_at < ...` (time-tracking.repository.ts) → covered by `time_entries_employee_started_idx (employee_id, started_at)` (`schema.prisma:920`). Good.
- `WHERE employee_id = $1 AND ended_at IS NULL` → covered by the partial unique index `time_entries_one_active_per_employee` (`schema.prisma:908`). Good.
- `WHERE status IN ('pending','rejected')` (pending-work.repository.ts) → covered by the partial index `@@index([status], where: status <> 'approved')` (`schema.prisma:921`). Good.
- **Gap**: `WHERE project_id = $1 AND status = 'approved'` (`projects.repository.ts:121`, inside a
  `UNION` of employee ids on a project) and `WHERE time_entries.status = 'approved' AND
  projects.organization_id = $1 [AND time_entries.project_id = $2]`
  (`project-financials.repository.ts:34-36`, the per-project/per-company labor-cost rollup) — checked every
  `@@index`/`@@unique` on the `time_entries` model (`schema.prisma:906-922`) and confirmed **`project_id`
  has no index at all** on this table. Every cost summary for a project or a whole company currently does a
  full scan of `time_entries` filtered by `status`. This is the single biggest index gap on the busiest
  table. **HIGH priority**, see §5.

### `work_assignments` — grows with every admin-scheduled task
- `WHERE employee_id = $1 AND project_id = $2 AND start_date <= $3 AND end_date >= $3` — the overlap check,
  in both `pending-work.repository.ts:60-61` and `time-tracking.repository.ts:105-106`.
- `WHERE projects.organization_id = $1 [AND work_assignments.project_id = ...] [AND
  work_assignments.employee_id = ...] ORDER BY start_date DESC, created_at DESC` —
  `assignments.repository.ts:70-71`, built from `assignments.service.ts:34-46`.
- `WHERE project_id = $1 ORDER BY start_date` — `projects.repository.ts:138`.
- **Correction from the previous draft**: this table is *not* unindexed. `project_id` already has an index
  — created by `supabase/migrations/20260922000000_create_work_assignments.sql:15`
  (`create index work_assignments_project_id_idx on work_assignments(project_id)`) and confirmed in
  `schema.prisma:937` (`@@index([project_id])`). That covers the `projects.repository.ts:138` query and the
  project-only branch of the listing query well.
  The real gap is **`employee_id`**, which has no index at all: the overlap check filters on `employee_id`
  first (and `project_id` is a secondary, more selective filter, so Postgres would still have to scan every
  row for that employee without one), and the listing query's employee-only branch
  (`work_assignments.employee_id = $n` with no `project_id`) has nothing to use either. **HIGH priority**,
  see §5 (revised).

### `site_visits` — new table (FEAT-04/04B/04C), will grow with every logged visit
- `WHERE organization_id = $1 AND visit_date BETWEEN ... [AND member_id = $2] [AND project_id = $3]` → the
  `(organization_id, visit_date)` (`schema.prisma:866`, map `site_visits_org_date_idx`) and
  `(organization_id, member_id, visit_date)` (`schema.prisma:867`, map `site_visits_org_member_date_idx`)
  indexes cover the month-only and month+person cases well. **Gap**: filtering "by project" (the
  `project_id` query param, and the FEAT-04C "By project" tab) has no matching index — checked the full
  `site_visits` model (`schema.prisma:849-868`) and found no index with `project_id` in it; it falls back to
  the `(organization_id, visit_date)` index plus a row-by-row filter on `project_id`. Low risk today (the
  table is brand new and small) but worth adding proactively since it's explicitly called out as a growth
  table. **LOW/MEDIUM**, see §5.

### `payments` — grows with every recorded payment
- `WHERE organization_id = $1 [AND project_id = $2] ORDER BY payment_date DESC, id DESC` —
  `payments.repository.ts:23-24` → when a project filter is given, `payments_project_id_idx (project_id,
  payment_date)` (`schema.prisma:630`) covers it well. **Gap**: the plain "all of this company's payments"
  listing (no project filter) only has `@@index([organization_id])` (`schema.prisma:629`) — the
  `organization_id` filter is covered, but the `ORDER BY payment_date` is not, so Postgres must sort the
  matching rows itself instead of walking an index in order. **MEDIUM**, see §5.
- `WHERE invoice_id = $1 AND cancelled_at IS NULL` (the "amount already paid" check) → covered by `invoice_payments_invoice_id_idx (invoice_id, payment_date)` (`schema.prisma:627`). Good.

### `reminder_runs` — Jalal's list, but turns out to need nothing
- The only queries against this table are an `INSERT` and an `UPDATE ... WHERE organization_id = $1 AND
  run_date = $2` (`reminders.repository.ts`). The existing `@@unique([organization_id, run_date])`
  (`schema.prisma:825`) already covers both perfectly, and this table is naturally capped at **one row per
  company per day** — it will never become large. No action needed.

### Duplicate indexes (found by reading every migration, not just the current schema)

**Correction from the previous draft**: the previous version of this section listed six tables and got two
of the seven's migration attributions wrong (it credited `categories_name_key` and `suppliers_org_id_key`
to the wrong migration file). Re-checked by grepping every `supabase/migrations/*.sql` file for `unique
(organization_id` / `unique index ... organization_id` and matching each hit against the 11 tables that got
a plain `create index %I on %I (organization_id)` from the bulk loop in
`20261026000000_organization_id_on_main_tables.sql:35-45` (`clients, projects, employees, estimates,
invoices, payments, suppliers, categories, money_locations, money_movements, auth_sessions`). Of those 11,
**seven** turn out to have a later composite index/constraint whose *leading* column is also
`organization_id` — which, by Postgres's leftmost-prefix rule, makes the plain single-column index fully
redundant for any query that only filters on `organization_id`. `employees`, `money_movements`, and
`auth_sessions` do **not** have such a composite and are correctly not flagged.

| Table | Redundant index | Made redundant by | Added in |
|---|---|---|---|
| `categories` | `categories_organization_id_idx` | `categories_org_id_key` unique `(organization_id, id)` | `20261027000000_project_teams_and_service_types.sql:20` |
| `categories` | (same index, second reason) | `categories_name_key` unique `(organization_id, name)` | `20261026000000_organization_id_on_main_tables.sql:65-67` (same file as the bulk loop, not `20261027000000` as the previous draft said) |
| `clients` | `clients_organization_id_idx` | `clients_org_id_key` unique `(organization_id, id)` | `20261027000000_project_teams_and_service_types.sql:16` |
| `estimates` | `estimates_organization_id_idx` | `estimates_number_key` unique index `(organization_id, lower(estimate_number))` — missed in the previous draft because it's an expression index Prisma can't render as `@@unique` (see the "expression index" comment on the `estimates` model, `schema.prisma:230`) | `20261026000000_organization_id_on_main_tables.sql:55-57`, same file as the bulk loop |
| `invoices` | `invoices_organization_id_idx` | `invoices_invoice_number_key` unique `(organization_id, invoice_number)` | `20261026000000_organization_id_on_main_tables.sql:60-62`, same file as the bulk loop |
| `money_locations` | `money_locations_organization_id_idx` | `money_locations_org_id_key` unique `(organization_id, id)` | `20261027000000_project_teams_and_service_types.sql:18` |
| `projects` | `projects_organization_id_idx` | `projects_org_id_key` unique `(organization_id, id)` | `20261027000000_project_teams_and_service_types.sql:17` |
| `suppliers` | `suppliers_organization_id_idx` | `suppliers_org_id_key` unique `(organization_id, id)` | `20261027000000_project_teams_and_service_types.sql:19` (the previous draft wrongly credited this to `20261026000000`) |
| `suppliers` | (same index, second reason) | `suppliers_unique_name` unique index `(organization_id, lower(trim(name)))` | `20261026000000_organization_id_on_main_tables.sql:70-72`, same file as the bulk loop |

All seven plain indexes were created in the same bulk loop
(`supabase/migrations/20261026000000_organization_id_on_main_tables.sql:44`:
`create index %I on %I (organization_id)`, run once per table in the `foreach` array at lines 35-38); the
composite indexes/constraints that superseded them were added either later in that same file or in the
very next migration — this reads like an oversight rather than a deliberate choice. Dropping them costs
nothing in query performance and saves Postgres a write (and disk page) on every `INSERT`/`UPDATE`/`DELETE`
to these seven tables. **LOW priority** (pure cleanup), see §5.

Every other table's indexing matches its queries reasonably well; `money_movements` (8 single-column
indexes, one per FK — `schema.prisma:514-522`) and `letters`/`receipts` (indexed on every column a detail
page or list filters by — `schema.prisma:435-436`, `:807-809`) are in good shape and weren't flagged above.
`employees`, `auth_sessions`, and `money_movements` keep their plain `organization_id` index because none of
the three has a composite constraint/index that leads with `organization_id` today (if recommendation M1 in
§5 is ever applied, it adds `employees_org_id_key unique (organization_id, id)`, which would make
`employees_organization_id_idx` redundant too — worth revisiting L1 at that point, not before).

## 4. UUID vs sequential ids

**Recommendation: keep `bigint` identity ids. Do not switch to UUID.**

Arguments for UUID generally are: (a) ids are unguessable, so exposing one in a URL doesn't leak "how many
rows exist" or let someone enumerate other rows; (b) ids can be generated client-side or merged across
databases without collision. Checked against this app specifically:

- **Ids do appear in URLs** (`/api/projects/:projectId`, `/api/site-visits/:id`, etc.), but **every one of
  those routes is already behind authentication and an `organization_id` scope check** on the query itself
  (`WHERE id = $1 AND organization_id = $2`, everywhere). Verified by grepping every `app.get/post/put/patch/
  delete(` call across all of `server/src/modules` (over 90 routes): every single one carries an
  `allow(Role...)` middleware argument except `POST /api/auth/login` (`auth.routes.ts:25`, the login
  endpoint itself, which by necessity can't require auth to reach it and doesn't expose any id-keyed data).
  There is no unauthenticated/"public" route in the codebase that relies on an id being hard to guess as its
  *only* protection. Guessing another company's bigint id today just gets a 404 from the existing org check
  — switching to UUID would not change what's actually protecting that data. (If a public, token-based share
  link is ever added — e.g. "email this invoice as a public link" — that should use its own random token
  column, not a UUID primary key, the same way a password-reset token works.)
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

**H2 — Index `work_assignments.employee_id`** (corrected: `project_id` is already indexed —
`work_assignments_project_id_idx`, `supabase/migrations/20260922000000_create_work_assignments.sql:15`,
`schema.prisma:937` — so only `employee_id` needs one, for the overlap check and the employee-filtered
assignments list; this does **not** duplicate the existing index):
```sql
create index work_assignments_employee_dates_idx on work_assignments (employee_id, start_date, end_date);
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

**L1 — Drop the seven redundant `organization_id`-only indexes** (see §3's duplicate-index table; `estimates`
was missed in the first draft of this review):
```sql
drop index categories_organization_id_idx;
drop index clients_organization_id_idx;
drop index estimates_organization_id_idx;
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

1. **`work_assignments.employee_id` has no index** — `project_id` already has one (this was wrong in the
   first draft of this review), but the employee/project overlap check run on every new assignment, and the
   employee-filtered assignments list, both still do a full table scan today. Easy, safe fix (H2).
2. **`time_entries.project_id` has no index**, so the per-project and per-company labor-cost rollups scan
   the whole table. This is the table that will grow fastest. Easy, safe fix (H1).
3. **`invoice_disbursements` cascade-deletes with its invoice**, while every comparable financial child
   table (`payments`, `receipts`) is protected from exactly that. Not reachable today (no delete-invoice
   route exists yet), but a landmine for the next person who adds one (H3).
4. **`money_movements` enforces "same company" for 5 of its 9 relations but not the other 4** — the
   client/employee/invoice/payment links on this table aren't checked by the database at all, only by the
   app's `WHERE organization_id = ...` on every query (M1).
5. **Seven indexes are pure dead weight** — `categories`, `clients`, `estimates`, `invoices`,
   `money_locations`, `projects`, and `suppliers` each carry a duplicate index that a later migration
   superseded and never removed. (`estimates` was missed in the first draft; its duplicate is an expression
   index Prisma doesn't surface as a normal `@@unique`.) (L1)
6. **UUID vs sequential ids**: recommend staying with `bigint`. Every route is already auth + company
   scoped, so id-guessing isn't actually a live risk here, and a re-key would be a large, risky project with
   no dev database to rehearse it in, for a problem this app doesn't have.
