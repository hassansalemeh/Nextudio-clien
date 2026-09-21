-- Estimates (quotations). Header + line items. Invoice conversion comes later and is not part of this.

create table estimates (
    id              bigint generated always as identity primary key,
    estimate_number text not null,
    title           text not null default 'Quotation',   -- document heading, e.g. "Quotation"
    summary         text,                                -- project name / short description under the title
    client_id       bigint references clients(id) on delete restrict,
    contact_name    text,
    customer_ref    text,
    estimate_date   date not null default current_date,
    valid_until     date,
    currency        text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
    status          text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
    notes           text,                                -- notes / terms
    subtotal        numeric(14,2) not null default 0 check (subtotal >= 0),
    discount        numeric(14,2) not null default 0 check (discount >= 0),
    total           numeric(14,2) not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    check (valid_until is null or valid_until >= estimate_date)
);

create unique index estimates_number_key on estimates(lower(estimate_number));
create index estimates_client_id_idx on estimates(client_id);

-- Line items ("Services" rows): name + long description, quantity x unit price = amount
create table estimate_items (
    id          bigint generated always as identity primary key,
    estimate_id bigint not null references estimates(id) on delete cascade,
    position    integer not null default 0,
    name        text not null,
    description text,
    quantity    numeric(14,2) not null default 1 check (quantity >= 0),
    unit_price  numeric(14,2) not null default 0 check (unit_price >= 0),
    amount      numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored
);

create index estimate_items_estimate_id_idx on estimate_items(estimate_id, position);

alter table estimates enable row level security;
alter table estimate_items enable row level security;
