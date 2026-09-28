-- Accounting Workspace, Phase 1A: a real double-entry ledger, kept completely separate from the existing
-- projects/invoices/payments tables (those stay authoritative for their own domains and are only referenced
-- here by id). Two independent "books" (NEXTUDIO, NEXTUDIO SARL) must never mix: every book-scoped table
-- carries its own book_id, and every reference between two book-scoped tables uses a composite foreign key
-- (book_id, other_id) -> other_table(book_id, id), so Postgres itself rejects a cross-book reference.
--
-- There is deliberately no stored "current balance" anywhere: every balance is derived at read time from
-- posted accounting_journal_lines. There are also no triggers (this schema has none anywhere) and no native
-- enum types (status-like columns are text + check, matching every other table) - the invariants that would
-- normally need a trigger (a posted entry balances, a posted entry is immutable) are enforced in the backend
-- posting service instead, which is the only code path allowed to write accounting_journal_lines.

create table accounting_books (
    id            bigint generated always as identity primary key,
    code          text not null unique check (code ~ '^[A-Z0-9_]+$'),
    name          text not null,
    currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
    is_active     boolean not null default true,
    created_at    timestamptz not null default now()
);

alter table accounting_books enable row level security;

-- Chart of accounts, one per book. No statutory chart is seeded here (see the seed migration) - the legacy
-- Polypus chart is mapped/imported in a later phase.
create table accounting_accounts (
    id             bigint generated always as identity primary key,
    book_id        bigint not null references accounting_books(id) on delete restrict,
    code           text,
    name           text not null,
    type           text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense')),
    normal_balance text not null check (normal_balance in ('debit', 'credit')),
    description    text,
    is_active      boolean not null default true,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    -- (book_id, id) order, matching every composite FK below that references this table - Postgres matches a
    -- referenced unique constraint by column set regardless of order, but declaring it in the same order the
    -- FKs use removes any doubt
    unique (book_id, id),
    check (
        (type in ('asset', 'expense') and normal_balance = 'debit') or
        (type in ('liability', 'equity', 'income') and normal_balance = 'credit')
    )
);

create unique index accounting_accounts_book_code_idx on accounting_accounts(book_id, code) where code is not null;
create unique index accounting_accounts_book_name_idx on accounting_accounts(book_id, lower(name));
create index accounting_accounts_book_type_idx on accounting_accounts(book_id, type);

alter table accounting_accounts enable row level security;

-- Cash / bank / card / petty-cash / project-fund accounts. Each must post to an asset account in the same
-- book (enforced by the composite FK below); a project_fund account must be tied to an existing project.
create table accounting_cash_accounts (
    id                bigint generated always as identity primary key,
    book_id           bigint not null references accounting_books(id) on delete restrict,
    name              text not null,
    kind              text not null check (kind in ('cash', 'bank', 'card', 'petty_cash', 'project_fund')),
    ledger_account_id bigint not null,
    project_id        bigint references projects(id) on delete restrict,
    currency_code     text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
    is_active         boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (book_id, id),
    foreign key (book_id, ledger_account_id) references accounting_accounts(book_id, id) on delete restrict,
    check (kind <> 'project_fund' or project_id is not null)
);

create unique index accounting_cash_accounts_book_name_idx on accounting_cash_accounts(book_id, lower(name));
create index accounting_cash_accounts_project_idx on accounting_cash_accounts(project_id) where project_id is not null;

alter table accounting_cash_accounts enable row level security;

-- Payees: workers, contractors, suppliers, consultants, employees, clients, government, other. Optionally
-- linked to the existing clients/employees records so a payee's history can be cross-referenced, but the
-- payee record itself is what accounting_transactions/accounting_journal_lines point at.
create table accounting_counterparties (
    id           bigint generated always as identity primary key,
    book_id      bigint not null references accounting_books(id) on delete restrict,
    name         text not null,
    kind         text not null check (kind in ('worker', 'contractor', 'supplier', 'consultant', 'employee', 'client', 'government', 'other')),
    client_id    bigint references clients(id) on delete set null,
    employee_id  bigint references employees(id) on delete set null,
    contact_info text,
    is_active    boolean not null default true,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (book_id, id)
);

create unique index accounting_counterparties_book_name_idx on accounting_counterparties(book_id, lower(name));

alter table accounting_counterparties enable row level security;

-- The double-entry ledger header. There is deliberately only ONE relationship between a transaction and the
-- entry it produced: accounting_transactions.journal_entry_id (below). This table does NOT also carry a
-- transaction_id pointing back - a transaction "belongs to" its entry, not the other way around, and the
-- reverse lookup (which transaction, if any, produced a given entry) is a plain query on that one column
-- (WHERE journal_entry_id = <entry id>), which is a 1:1 relationship in practice since each posting creates a
-- brand new entry. Avoiding a second, back-pointing FK means there is no pair of columns that could ever
-- disagree with each other.
--
-- IMPORTANT: once posted, status stays 'posted' forever - it is never set to 'reversed'. A correction is a
-- brand new, separate entry (reversal_of_entry_id points from the new entry back at the one it reverses); the
-- original is left exactly as posted. This is what makes every report that filters on status = 'posted'
-- (General Journal, Trial Balance, Account/Cash Account/Project/Payee Statements, dashboard totals, cash
-- balances) automatically show BOTH the original and its reversal, whose debits/credits cancel out - rather
-- than the original silently disappearing from every balance the moment it is reversed. Whether an entry has
-- been reversed is instead answered by checking whether another entry exists with
-- reversal_of_entry_id = this entry's id.
create table accounting_journal_entries (
    id                   bigint generated always as identity primary key,
    book_id              bigint not null references accounting_books(id) on delete restrict,
    entry_date           date not null,
    reference            text,
    description          text,
    status               text not null default 'posted' check (status in ('draft', 'posted', 'reversed')),
    reversal_of_entry_id bigint references accounting_journal_entries(id) on delete restrict,
    posted_at            timestamptz,
    posted_by_user_id    bigint references app_users(id) on delete set null,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now(),
    unique (id, book_id)
);

create unique index accounting_journal_entries_book_ref_idx on accounting_journal_entries(book_id, reference) where reference is not null;
create index accounting_journal_entries_book_date_idx on accounting_journal_entries(book_id, entry_date desc, id desc);
create index accounting_journal_entries_status_idx on accounting_journal_entries(status);
create index accounting_journal_entries_reversal_of_idx on accounting_journal_entries(reversal_of_entry_id) where reversal_of_entry_id is not null;

alter table accounting_journal_entries enable row level security;

-- The human-facing transaction: what a non-accountant actually filled in (Paid To, Paid From, Purpose...).
-- Exactly one of category_account_id / from_cash_account_id / to_cash_account_id combination is required per
-- direction (enforced by the check below), matching the simple posting model: Dr expense/Cr cash (money_out),
-- Dr cash/Cr income-or-liability (money_in), Dr destination cash/Cr source cash (transfer, never P&L).
-- Like accounting_journal_entries.status above, a posted transaction's status also stays 'posted' forever -
-- reversing it creates a new transaction row (reversal_of_transaction_id points back at the original) rather
-- than changing the original's status, for the same reporting reason.
create table accounting_transactions (
    id                         bigint generated always as identity primary key,
    book_id                    bigint not null references accounting_books(id) on delete restrict,
    direction                  text not null check (direction in ('money_in', 'money_out', 'transfer', 'non_cash')),
    status                     text not null default 'draft' check (status in ('draft', 'approved', 'posted', 'reversed')),
    transaction_date           date not null,
    description                text,
    amount                     numeric(14,2) not null check (amount > 0),
    currency_code              text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
    exchange_rate              numeric(18,6),
    project_id                 bigint references projects(id) on delete restrict,
    counterparty_id            bigint,
    category_account_id        bigint,
    from_cash_account_id       bigint,
    to_cash_account_id         bigint,
    reference                  text,
    reversal_of_transaction_id bigint references accounting_transactions(id) on delete restrict,
    journal_entry_id           bigint references accounting_journal_entries(id) on delete restrict,
    created_by_user_id         bigint references app_users(id) on delete set null,
    created_at                 timestamptz not null default now(),
    updated_at                 timestamptz not null default now(),
    unique (id, book_id),
    foreign key (book_id, counterparty_id) references accounting_counterparties(book_id, id) on delete restrict,
    foreign key (book_id, category_account_id) references accounting_accounts(book_id, id) on delete restrict,
    foreign key (book_id, from_cash_account_id) references accounting_cash_accounts(book_id, id) on delete restrict,
    foreign key (book_id, to_cash_account_id) references accounting_cash_accounts(book_id, id) on delete restrict,
    check (
        (direction = 'money_out' and from_cash_account_id is not null and to_cash_account_id is null and category_account_id is not null) or
        (direction = 'money_in' and to_cash_account_id is not null and from_cash_account_id is null and category_account_id is not null) or
        (direction = 'transfer' and from_cash_account_id is not null and to_cash_account_id is not null
            and from_cash_account_id <> to_cash_account_id and category_account_id is null) or
        (direction = 'non_cash' and from_cash_account_id is null and to_cash_account_id is null and category_account_id is not null)
    )
);

create index accounting_transactions_book_date_idx on accounting_transactions(book_id, transaction_date desc, id desc);
create index accounting_transactions_project_idx on accounting_transactions(project_id) where project_id is not null;
create index accounting_transactions_counterparty_idx on accounting_transactions(counterparty_id) where counterparty_id is not null;
create index accounting_transactions_status_idx on accounting_transactions(status);
-- the reverse lookup "which transaction produced this journal entry" (a plain equality query, not a second FK)
create unique index accounting_transactions_journal_entry_idx on accounting_transactions(journal_entry_id) where journal_entry_id is not null;
create index accounting_transactions_reversal_of_idx on accounting_transactions(reversal_of_transaction_id) where reversal_of_transaction_id is not null;

alter table accounting_transactions enable row level security;

-- The actual double-entry postings. book_id is denormalized from the parent entry (rather than joined every
-- time) specifically so the composite foreign keys below can pin account/cash-account/counterparty references
-- to the same book as the line itself. A posted entry's lines are never updated or deleted by the app - only
-- inserted once by the posting service, or read.
create table accounting_journal_lines (
    id               bigint generated always as identity primary key,
    journal_entry_id bigint not null references accounting_journal_entries(id) on delete cascade,
    book_id          bigint not null,
    account_id       bigint not null,
    debit            numeric(14,2) not null default 0 check (debit >= 0),
    credit           numeric(14,2) not null default 0 check (credit >= 0),
    project_id       bigint references projects(id) on delete restrict,
    counterparty_id  bigint,
    cash_account_id  bigint,
    memo             text,
    created_at       timestamptz not null default now(),
    foreign key (journal_entry_id, book_id) references accounting_journal_entries(id, book_id),
    foreign key (book_id, account_id) references accounting_accounts(book_id, id) on delete restrict,
    foreign key (book_id, counterparty_id) references accounting_counterparties(book_id, id) on delete restrict,
    foreign key (book_id, cash_account_id) references accounting_cash_accounts(book_id, id) on delete restrict,
    check (debit = 0 or credit = 0),
    check (debit > 0 or credit > 0)
);

create index accounting_journal_lines_entry_idx on accounting_journal_lines(journal_entry_id);
create index accounting_journal_lines_account_idx on accounting_journal_lines(book_id, account_id);
create index accounting_journal_lines_cash_account_idx on accounting_journal_lines(cash_account_id) where cash_account_id is not null;
create index accounting_journal_lines_project_idx on accounting_journal_lines(project_id) where project_id is not null;

alter table accounting_journal_lines enable row level security;

-- Every sensitive accounting action: creation, posting, reversal, and Setup configuration changes.
create table accounting_audit_log (
    id                   bigint generated always as identity primary key,
    book_id              bigint references accounting_books(id) on delete restrict,
    entity_type          text not null check (entity_type in ('transaction', 'journal_entry', 'account', 'cash_account', 'counterparty', 'book')),
    entity_id            bigint not null,
    action               text not null check (action in ('create', 'update', 'post', 'reverse', 'deactivate', 'reactivate', 'delete')),
    performed_by_user_id bigint references app_users(id) on delete set null,
    performed_at         timestamptz not null default now(),
    before               jsonb,
    after                jsonb,
    notes                text
);

create index accounting_audit_log_entity_idx on accounting_audit_log(entity_type, entity_id, performed_at desc);

alter table accounting_audit_log enable row level security;

-- Human-friendly journal entry references, e.g. NEXTUDIO-JE-1, NEXTUDIO_SARL-JE-1
create sequence accounting_journal_reference_seq;
