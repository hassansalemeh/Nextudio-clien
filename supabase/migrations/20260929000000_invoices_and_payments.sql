-- Invoices are created when an estimate is approved. Each keeps its own copy of the quotation lines.
-- Payments are separate records; the amount paid / due is always calculated from them.

create sequence invoice_number_seq;

create table invoices (
    id              bigint generated always as identity primary key,
    -- exactly one invoice per estimate: this is what makes approval safe against duplicates
    estimate_id     bigint not null unique references estimates(id) on delete restrict,
    invoice_number  text not null unique,
    client_id       bigint not null references clients(id) on delete restrict,
    contact_name    text,
    title           text not null,
    summary         text,
    invoice_date    date not null,
    due_date        date,
    currency        text not null check (currency ~ '^[A-Z]{3}$'),
    notes           text,
    subtotal        numeric(14,2) not null,
    discount_type   text not null check (discount_type in ('fixed', 'percent')),
    discount_value  numeric(14,2) not null,
    discount        numeric(14,2) not null,
    total           numeric(14,2) not null,
    created_at      timestamptz not null default now()
);

create table invoice_items (
    id          bigint generated always as identity primary key,
    invoice_id  bigint not null references invoices(id) on delete cascade,
    position    integer not null default 0,
    name        text not null,
    description text,
    quantity    numeric(14,2) not null,
    unit        text not null check (unit in ('sqm', 'lm', 'ls', 'pc', 'm3', 'sheet')),
    unit_price  numeric(14,2) not null,
    amount      numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored
);

create index invoice_items_invoice_id_idx on invoice_items(invoice_id, position);

create table invoice_payments (
    id           bigint generated always as identity primary key,
    invoice_id   bigint not null references invoices(id) on delete restrict,
    payment_date date not null,
    amount       numeric(14,2) not null check (amount > 0),
    method       text not null check (method in ('cash', 'bank_transfer', 'cheque', 'card', 'other')),
    reference    text,
    created_at   timestamptz not null default now()
);

create index invoice_payments_invoice_id_idx on invoice_payments(invoice_id, payment_date);

-- Estimate -> Invoice -> Project links. One project per estimate and per invoice.
alter table projects
    add column source_estimate_id bigint unique references estimates(id) on delete set null,
    add column source_invoice_id  bigint unique references invoices(id) on delete set null;

alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table invoice_payments enable row level security;
