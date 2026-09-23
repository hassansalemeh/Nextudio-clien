-- A second invoice type: money a client hands over for project expenses (construction workers, suppliers,
-- materials, site expenses...) rather than Nextudio's own professional/design fee. It must stay identifiable
-- and excluded from confirmed project value, professional revenue and profitability wherever those are computed.

create sequence client_funds_invoice_number_seq;

alter table invoices
    add column invoice_type text not null default 'professional_services'
        check (invoice_type in ('professional_services', 'client_funds')),
    add column project_id bigint references projects(id) on delete restrict,
    -- e.g. a client PO or reference number; estimates already have the equivalent customer_ref
    add column customer_ref text;

-- Every existing invoice already has a project through the reverse link created at approval time.
-- This gives both invoice types one uniform forward pointer to their project.
update invoices set project_id = projects.id
from projects where projects.source_invoice_id = invoices.id;

-- A Client Funds invoice attaches to an existing project directly; it can never exist without one.
alter table invoices add constraint invoices_client_funds_requires_project
    check (invoice_type <> 'client_funds' or project_id is not null);

-- Every "Send by Email" attempt for an invoice. Mirrors estimate_emails; invoices had no email history yet.
create table invoice_emails (
    id              bigint generated always as identity primary key,
    invoice_id      bigint not null references invoices(id) on delete cascade,
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

create index invoice_emails_invoice_id_idx on invoice_emails(invoice_id, sent_at desc);

alter table invoice_emails enable row level security;

-- How a Client Funds invoice's money was spent. Simple record-keeping, separate from payments (money in)
-- and never used in employee labor-cost calculations.
create table invoice_disbursements (
    id                  bigint generated always as identity primary key,
    invoice_id          bigint not null references invoices(id) on delete cascade,
    disbursement_date   date not null,
    payee               text not null,
    description         text,
    category            text,
    amount              numeric(14,2) not null check (amount > 0),
    reference           text,
    created_by_user_id  bigint references app_users(id) on delete set null,
    created_at          timestamptz not null default now()
);

create index invoice_disbursements_invoice_id_idx on invoice_disbursements(invoice_id, disbursement_date);

alter table invoice_disbursements enable row level security;
