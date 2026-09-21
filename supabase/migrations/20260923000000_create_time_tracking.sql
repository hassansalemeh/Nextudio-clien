-- V1 employee time tracking: clock in/out sessions and project time entries with real timestamps.
-- (work_entries from an earlier version is left untouched and unused.)

create extension if not exists btree_gist;

-- One row per clock-in/clock-out. clock_out is null while the employee is clocked in.
create table attendance (
    id          bigint generated always as identity primary key,
    employee_id bigint not null references employees(id) on delete restrict,
    clock_in    timestamptz not null,
    clock_out   timestamptz,
    created_at  timestamptz not null default now(),
    check (clock_out is null or clock_out > clock_in)
);

-- An employee can only be clocked in once at a time
create unique index attendance_one_open_per_employee on attendance(employee_id) where clock_out is null;

-- One row per continuous stretch on a project. ended_at is null while the timer runs.
create table time_entries (
    id          bigint generated always as identity primary key,
    employee_id bigint not null references employees(id) on delete restrict,
    project_id  bigint not null references projects(id) on delete restrict,
    started_at  timestamptz not null,
    ended_at    timestamptz,
    created_at  timestamptz not null default now(),
    check (ended_at is null or ended_at > started_at),
    -- an employee's entries may never overlap (an open entry runs to infinity)
    exclude using gist (employee_id with =, tstzrange(started_at, ended_at) with &&)
);

-- Only one running timer per employee
create unique index time_entries_one_active_per_employee on time_entries(employee_id) where ended_at is null;

create index time_entries_employee_started_idx on time_entries(employee_id, started_at);
create index attendance_employee_clock_in_idx on attendance(employee_id, clock_in);

alter table attendance enable row level security;
alter table time_entries enable row level security;
