-- Site visits: staff employees log when they went to a project site and for how long.

create table site_visits (
    id              bigint generated always as identity primary key,
    organization_id bigint not null references organizations(id) on delete restrict,
    employee_id     bigint not null references employees(id) on delete restrict,
    project_id      bigint not null references projects(id) on delete restrict,
    visit_date      date not null,
    start_time      time not null,
    end_time        time check (end_time > start_time),
    note            text check (char_length(note) <= 500),
    created_by      bigint not null references app_users(id) on delete restrict,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index site_visits_org_date_idx on site_visits(organization_id, visit_date);
create index site_visits_org_employee_date_idx on site_visits(organization_id, employee_id, visit_date);

alter table site_visits enable row level security;
