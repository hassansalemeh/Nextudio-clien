-- Guarantees the daily work-submission reminder sends at most once per organization per day, even if the
-- server restarts mid-window or two containers briefly overlap during a Railway deploy: the job claims a
-- date by inserting a row here (unique per organization+date) before doing any work - whichever process
-- wins the insert is the one that runs; every other process sees the conflict and does nothing.
create table reminder_runs (
    id              bigint generated always as identity primary key,
    organization_id bigint not null references organizations(id) on delete restrict,
    run_date        date not null,
    -- 'sent': the window was open and this process ran the reminder batch (even if some individual emails
    -- failed - that's still logged, just not retried). 'missed_window': the server was down for the whole
    -- window, so this date is marked done without sending anything, rather than sending a late reminder.
    outcome         text not null check (outcome in ('sent', 'missed_window')),
    started_at      timestamptz not null default now(),
    completed_at    timestamptz,
    reminded_count  integer,
    skipped_count   integer,
    unique (organization_id, run_date)
);
