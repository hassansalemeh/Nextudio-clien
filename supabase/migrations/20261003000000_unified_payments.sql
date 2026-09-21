-- One payment system. Money received from a client is a row in `payments`, linked to a project (required)
-- and optionally to that project's invoice. Invoice paid / due, project payments and the dashboard all sum this one table.
-- This renames the old invoice-only table instead of creating a second one.

alter table invoice_payments rename to payments;

alter table payments add column project_id bigint references projects(id) on delete restrict;
alter table payments add column reason text;
alter table payments add column updated_at timestamptz not null default now();

-- any payment recorded before this migration belonged to an invoice: take the project from that invoice
update payments
set project_id = (select p.id from projects p where p.source_invoice_id = payments.invoice_id),
    reason = 'Payment'
where project_id is null;

alter table payments alter column project_id set not null;
alter table payments alter column reason set not null;

-- the invoice link and the method are now optional
alter table payments alter column invoice_id drop not null;
alter table payments alter column method drop not null;
alter table payments drop constraint invoice_payments_method_check;
alter table payments add constraint payments_method_check
    check (method is null or method in ('cash', 'bank_transfer', 'cheque', 'card', 'other'));
alter table payments add constraint payments_reason_not_blank check (length(btrim(reason)) > 0);

create index payments_project_id_idx on payments(project_id, payment_date);

-- Corrections never overwrite history: every edit first stores what the payment looked like before it
create table payment_revisions (
    id         bigint generated always as identity primary key,
    payment_id bigint not null references payments(id) on delete cascade,
    changed_at timestamptz not null default now(),
    previous   jsonb not null
);

create index payment_revisions_payment_id_idx on payment_revisions(payment_id);

alter table payment_revisions enable row level security;
