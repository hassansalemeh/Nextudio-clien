create table day_off_requests (
    id               bigint generated always as identity primary key,
    employee_id      bigint not null references employees(id) on delete restrict,
    request_date     date not null,
    reason           text,
    status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    reviewed_by      bigint references app_users(id) on delete set null,
    reviewed_at      timestamptz,
    created_at       timestamptz not null default now()
);

-- Only one non-rejected request per employee per date - a rejected request doesn't block a retry
create unique index day_off_requests_employee_date_key
    on day_off_requests(employee_id, request_date) where status <> 'rejected';
create index day_off_requests_status_idx on day_off_requests(status) where status = 'pending';

alter table day_off_requests enable row level security;
