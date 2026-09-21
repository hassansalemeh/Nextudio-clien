-- Login accounts with roles. Employees' accounts are linked to their employees row.

create table app_users (
    id            bigint generated always as identity primary key,
    email         text not null,
    password_hash text not null,
    role          text not null check (role in ('admin', 'employee')),
    employee_id   bigint references employees(id) on delete restrict,
    created_at    timestamptz not null default now(),
    -- employee accounts must be linked to an employee; admin accounts must not be
    check ((role = 'employee') = (employee_id is not null))
);

create unique index app_users_email_key on app_users(lower(email));
create unique index app_users_employee_id_key on app_users(employee_id);

-- Server-side login sessions; only a hash of the token is stored
create table auth_sessions (
    token_hash text primary key,
    user_id    bigint not null references app_users(id) on delete cascade,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

alter table app_users enable row level security;
alter table auth_sessions enable row level security;
