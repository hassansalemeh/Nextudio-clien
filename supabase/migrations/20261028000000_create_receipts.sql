-- Receipts: proof a payment was received, with an admin signer and the receiver's own signature line.
-- Note: the name "receipts" was used once before for an unrelated uploaded-expense/OCR feature, created
-- in 20260919000000_create_receipts.sql and dropped two days later in 20260921000000_drop_receipts.sql.
-- This is a fresh, unrelated table.

create table receipts (
    id                 bigint generated always as identity primary key,
    organization_id    bigint not null references organizations(id) on delete restrict,
    receipt_number     text not null,
    receipt_date       date not null default current_date,
    client_id          bigint references clients(id) on delete restrict,   -- optional link, for filtering/reporting
    project_id         bigint references projects(id) on delete restrict,  -- optional link
    receiver_name      text not null,
    receiver_email     text,                                               -- optional; prefills the send dialog's "To"
    amount             numeric(14,2) not null check (amount > 0),
    currency           text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
    reason             text not null,
    -- Validated at the app layer against a small fixed list (server/src/config/config.ts), not a DB check,
    -- so adding a third admin signer later is a one-line constant change, not a migration.
    issued_by_admin    text not null,
    document_language  text not null default 'en',
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create unique index receipts_number_key on receipts(organization_id, lower(receipt_number));
create index receipts_client_id_idx on receipts(client_id);
create index receipts_project_id_idx on receipts(project_id);
alter table receipts enable row level security;

-- Every "Send by Email" attempt for a receipt. Kept even after a resend; never deleted.
create table receipt_emails (
    id              bigint generated always as identity primary key,
    receipt_id      bigint not null references receipts(id) on delete cascade,
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
create index receipt_emails_receipt_id_idx on receipt_emails(receipt_id, sent_at desc);
alter table receipt_emails enable row level security;
