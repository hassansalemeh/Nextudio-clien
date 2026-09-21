-- Receipts: uploaded evidence with OCR draft data, reviewed and confirmed into a transaction

create table receipts (
    id                bigint generated always as identity primary key,
    file_path         text not null,
    status            text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
    draft_amount      numeric(12,2),
    draft_date        date,
    draft_party_name  text,
    draft_description text,
    transaction_id    bigint references transactions(id) on delete restrict,
    created_at        timestamptz not null default now(),
    confirmed_at      timestamptz
);

alter table receipts enable row level security;
