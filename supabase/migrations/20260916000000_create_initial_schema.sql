-- Initial schema: clients, employees, projects, project_services, project_assignments

create table clients (
    id           bigint generated always as identity primary key,
    name         text not null,
    contact_name text,
    email        text,
    phone        text,
    created_at   timestamptz not null default now()
);

create table employees (
    id             bigint generated always as identity primary key,
    full_name      text not null,
    position       text not null,
    monthly_salary numeric(12,2) not null check (monthly_salary >= 0),
    is_active      boolean not null default true,
    created_at     timestamptz not null default now()
);

create table projects (
    id          bigint generated always as identity primary key,
    client_id   bigint not null references clients(id) on delete restrict,
    name        text not null,
    description text,
    total_fee   numeric(12,2) not null check (total_fee >= 0),
    start_date  date,
    status      text not null default 'planning'
                check (status in ('planning', 'in_progress', 'completed', 'on_hold')),
    created_at  timestamptz not null default now()
);

create table project_services (
    id           bigint generated always as identity primary key,
    project_id   bigint not null references projects(id) on delete restrict,
    name         text not null,
    description  text,
    fee          numeric(12,2) not null check (fee >= 0),
    deliverables text
);

create table project_assignments (
    id          bigint generated always as identity primary key,
    project_id  bigint not null references projects(id) on delete restrict,
    employee_id bigint not null references employees(id) on delete restrict,
    is_active   boolean not null default true,
    assigned_at timestamptz not null default now(),
    unique (project_id, employee_id)
);

alter table clients enable row level security;
alter table employees enable row level security;
alter table projects enable row level security;
alter table project_services enable row level security;
alter table project_assignments enable row level security;
