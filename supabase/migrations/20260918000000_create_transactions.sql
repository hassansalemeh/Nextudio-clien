-- Transactions: actual money movement (income/expense), project-related or general

create table transactions (
    id               bigint generated always as identity primary key,
    type             text not null check (type in ('income', 'expense')),
    scope            text not null check (scope in ('project', 'general')),
    project_id       bigint references projects(id) on delete restrict,
    amount           numeric(12,2) not null check (amount > 0),
    transaction_date date not null,
    party_name       text not null,
    description      text,
    created_at       timestamptz not null default now(),
    constraint transactions_scope_project_check check (
        (scope = 'project' and project_id is not null) or
        (scope = 'general' and project_id is null)
    )
);

alter table transactions enable row level security;
