-- Project Location and Introduction on an estimate, carried through to the invoice and the project it creates.

alter table estimates
    add column project_location text,   -- e.g. "Beirut, Lebanon" or "Hazmieh - Said Freiha Street"; separate from the client's address
    add column introduction     text;   -- a proper opening paragraph for the quotation, separate from Notes/Terms

alter table invoices
    add column project_location text,
    add column introduction     text;

alter table projects
    add column location text;   -- inherited from the estimate's Project Location when created by approval

-- Every "Send by Email" attempt for an estimate. Kept even after a resend; never deleted.
create table estimate_emails (
    id              bigint generated always as identity primary key,
    estimate_id     bigint not null references estimates(id) on delete cascade,
    recipient       text not null,
    cc              text,
    subject         text not null,
    message         text,
    status          text not null check (status in ('sent', 'failed')),
    error           text,
    sent_by_user_id bigint references app_users(id) on delete set null,
    sent_by_email   text not null,
    sent_at         timestamptz not null default now()
);

create index estimate_emails_estimate_id_idx on estimate_emails(estimate_id, sent_at desc);

alter table estimate_emails enable row level security;
