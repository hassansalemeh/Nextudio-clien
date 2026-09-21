-- Work entries: time tracking against a project assignment

create table work_entries (
    id                   bigint generated always as identity primary key,
    project_id           bigint not null references projects(id) on delete restrict,
    employee_id          bigint not null references employees(id) on delete restrict,
    work_date            date not null,
    start_time           time not null,
    end_time             time not null,
    hourly_rate_snapshot numeric(12,2) not null check (hourly_rate_snapshot >= 0),
    created_at           timestamptz not null default now()
);

alter table work_entries enable row level security;
