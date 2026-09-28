-- Accounting project reporting model, v1 draft. NOT applied by the dry-run pipeline - this is a design
-- proposal for review (requirement 8), not a shipped feature. Read-only views only: no table, trigger or
-- constraint is touched.
--
-- One row per (book, scope), where scope is EITHER a real Control project (accounting_journal_lines.project_id)
-- OR a historical-only legacy job (accounting_journal_lines.legacy_job_id) - a line only ever carries one of
-- the two as its "scope" in this report (a confirmed-mapped job's lines carry project_id and are reported
-- under the project; everyone else's legacy_job_id). This is exactly what makes Btater/KZ Residence/Kayfoun/
-- AM Appartment/Chemlen/Souk El Ghareb fully visible and drillable (requirement 4) WITHOUT being real Control
-- projects: they get a row here keyed by legacy_job_id, with the same shape as a real project's row.
--
-- Labor cost is NEVER read from the ledger - accounting_journal_lines has no "time allocation" postings and
-- never will (requirement 8: "do NOT create a second cash payment for time allocation"). It is computed
-- on the fly from Control's own time_entries x hourly_rate_snapshot, joined by project_id only - a legacy job
-- with no Control project shows labor_cost = 0 (Control genuinely has no historical time data for it; nothing
-- is invented, per requirement 8's other instruction).
create view accounting_project_scope_report as
with scopes as (
    -- Real Control projects that have accounting activity
    select book_id, project_id as project_id, null::bigint as legacy_job_id
    from accounting_journal_lines
    where project_id is not null
    group by book_id, project_id
    union
    -- Historical-only legacy jobs (no Control project)
    select jl.book_id, null::bigint, jl.legacy_job_id
    from accounting_journal_lines jl
    where jl.legacy_job_id is not null
    group by jl.book_id, jl.legacy_job_id
),
funds as (
    -- LIA-CLIENTFUNDS (project-scoped) or LIA-CLIENTADV (unallocated advances, scoped by legacy_job_id when
    -- the source line carried one) - credit = received, debit = spent/disbursed on the client's behalf.
    select jl.book_id, jl.project_id, jl.legacy_job_id,
           coalesce(sum(jl.credit), 0) as funds_received,
           coalesce(sum(jl.debit), 0) as funds_spent
    from accounting_journal_lines jl
    join accounting_accounts a on a.id = jl.account_id
    where a.code in ('LIA-CLIENTFUNDS', 'LIA-CLIENTADV')
    group by jl.book_id, jl.project_id, jl.legacy_job_id
),
fees as (
    -- Revenue is recognized at invoice time (Cr INC-FEES), matching how this ledger books a professional-fee
    -- invoice - see the Phase 1B historical-import report. "Outstanding" is a separate, counterparty-level
    -- concept (AST-RECV is not scope-tagged) and is reported per-counterparty, not per-scope - see
    -- accounting_receivables_report below.
    select jl.book_id, jl.project_id, jl.legacy_job_id, coalesce(sum(jl.credit), 0) as fees_invoiced
    from accounting_journal_lines jl
    join accounting_accounts a on a.id = jl.account_id
    where a.code = 'INC-FEES'
    group by jl.book_id, jl.project_id, jl.legacy_job_id
),
direct_costs as (
    -- Project-cost accounts only (EXP-*), never company overhead (CEXP-*) or historical/suspense accounts.
    select jl.book_id, jl.project_id, jl.legacy_job_id, coalesce(sum(jl.debit), 0) as direct_cost
    from accounting_journal_lines jl
    join accounting_accounts a on a.id = jl.account_id
    where a.code like 'EXP-%'
    group by jl.book_id, jl.project_id, jl.legacy_job_id
),
labor as (
    -- Control's existing frozen-hourly-cost logic (hourly_rate_snapshot), never recomputed from current
    -- salary. Only real Control projects can have this - a legacy-only job has no project_id to join on.
    select p.id as project_id, sum(extract(epoch from (te.ended_at - te.started_at)) / 3600.0 * te.hourly_rate_snapshot) as labor_cost
    from time_entries te
    join projects p on p.id = te.project_id
    where te.ended_at is not null
    group by p.id
)
select
    s.book_id, s.project_id, s.legacy_job_id,
    coalesce(f.funds_received, 0) as funds_received,
    coalesce(f.funds_spent, 0) as funds_spent,
    coalesce(f.funds_received, 0) - coalesce(f.funds_spent, 0) as funds_remaining,
    coalesce(fe.fees_invoiced, 0) as fees_invoiced,
    coalesce(dc.direct_cost, 0) as direct_cost,
    coalesce(l.labor_cost, 0) as labor_cost,
    coalesce(dc.direct_cost, 0) + coalesce(l.labor_cost, 0) as total_project_cost,
    coalesce(fe.fees_invoiced, 0) - coalesce(dc.direct_cost, 0) - coalesce(l.labor_cost, 0) as contribution
from scopes s
left join funds f on f.book_id = s.book_id and f.project_id is not distinct from s.project_id and f.legacy_job_id is not distinct from s.legacy_job_id
left join fees fe on fe.book_id = s.book_id and fe.project_id is not distinct from s.project_id and fe.legacy_job_id is not distinct from s.legacy_job_id
left join direct_costs dc on dc.book_id = s.book_id and dc.project_id is not distinct from s.project_id and dc.legacy_job_id is not distinct from s.legacy_job_id
left join labor l on l.project_id = s.project_id;

-- Per-counterparty receivable/advance position (client money is NOT project-scoped in this ledger - see the
-- historical-import report's balance-driven resolver). "Outstanding" = a positive AST-RECV-classified balance
-- (they owe Nextudio); "held" = a positive LIA-CLIENTFUNDS/LIA-CLIENTADV balance (Nextudio holds their money).
create view accounting_receivables_report as
select jl.book_id, jl.counterparty_id,
    sum(case when a.code = 'AST-RECV' then jl.debit - jl.credit else 0 end) as outstanding_receivable,
    sum(case when a.code in ('LIA-CLIENTFUNDS', 'LIA-CLIENTADV') then jl.credit - jl.debit else 0 end) as funds_held
from accounting_journal_lines jl
join accounting_accounts a on a.id = jl.account_id
where jl.counterparty_id is not null and a.code in ('AST-RECV', 'LIA-CLIENTFUNDS', 'LIA-CLIENTADV')
group by jl.book_id, jl.counterparty_id;
