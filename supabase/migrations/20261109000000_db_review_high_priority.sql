-- High-priority fixes from the database design review (docs/db-review.md, H1-H3). Tables are
-- small enough that plain (non-concurrent) index creation is fine.

-- H1: time_entries has no index backing the per-project/per-company labor-cost rollups
-- (project-financials.repository.ts, projects.repository.ts), so they full-scan the busiest table.
create index if not exists time_entries_project_status_idx on time_entries (project_id, status);

-- H2: work_assignments.project_id is already indexed; employee_id is not, so the employee/project
-- overlap check (pending-work.repository.ts, time-tracking.repository.ts) and the employee-filtered
-- assignments list (assignments.repository.ts) both full-scan the table.
create index if not exists work_assignments_employee_dates_idx on work_assignments (employee_id, start_date, end_date);

-- H3: invoice_disbursements is the only financial child of invoices that cascades on delete -
-- payments and receipts both use RESTRICT. Not reachable today (no DELETE /api/invoices/:id route
-- exists), but a landmine for whoever adds one. Match the other financial tables' behaviour.
alter table invoice_disbursements drop constraint invoice_disbursements_invoice_id_fkey;
alter table invoice_disbursements add constraint invoice_disbursements_invoice_id_fkey
  foreign key (invoice_id) references invoices (id) on delete restrict;
