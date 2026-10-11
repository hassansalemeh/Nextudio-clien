-- Letters: plain business letters (no pricing) - a recipient, subject, free-text body with paragraphs
-- and bullet lists, and a single admin signature line.

create table letters (
    id                 bigint generated always as identity primary key,
    organization_id    bigint not null references organizations(id) on delete restrict,
    letter_number      text not null,
    letter_date        date not null default current_date,
    client_id          bigint references clients(id) on delete restrict,   -- optional link, for filtering/reporting
    project_id         bigint references projects(id) on delete restrict,  -- optional link
    recipient_name     text not null,   -- a name, or the literal "To Whom It May Concern"
    subject            text not null,
    body               text not null,   -- free text; blank-line-separated paragraphs, "- " lines become bullets, **bold** spans
    -- Validated at the app layer against a small fixed list (server/src/config/config.ts), not a DB check,
    -- so adding a third admin signer later is a one-line constant change, not a migration.
    issued_by_admin    text not null,
    document_language  text not null default 'en',
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);
create unique index letters_number_key on letters(organization_id, lower(letter_number));
create index letters_client_id_idx on letters(client_id);
create index letters_project_id_idx on letters(project_id);
alter table letters enable row level security;

-- Every "Send by Email" attempt for a letter. Kept even after a resend; never deleted.
create table letter_emails (
    id              bigint generated always as identity primary key,
    letter_id       bigint not null references letters(id) on delete cascade,
    recipient       text not null,
    cc              text,
    subject         text not null,
    message         text,
    status          text not null check (status in ('sent', 'failed')),
    error           text,
    sent_by_user_id bigint references app_users(id) on delete set null,
    sent_by_email   text not null,
    sent_at         timestamptz not null default now()
);
create index letter_emails_letter_id_idx on letter_emails(letter_id, sent_at desc);
alter table letter_emails enable row level security;
