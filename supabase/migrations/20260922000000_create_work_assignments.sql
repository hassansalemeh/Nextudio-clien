-- Work assignments: admin assigns an employee to a task on a project for a date range.
-- Dates only describe the assignment period; actual worked time is tracked separately (work_entries).

create table work_assignments (
    id           bigint generated always as identity primary key,
    project_id   bigint not null references projects(id) on delete restrict,
    employee_id  bigint not null references employees(id) on delete restrict,
    start_date   date not null,
    end_date     date not null,
    description  text not null check (length(btrim(description)) > 0),
    created_at   timestamptz not null default now(),
    check (end_date >= start_date)
);

create index work_assignments_project_id_idx on work_assignments(project_id);

alter table work_assignments enable row level security;
