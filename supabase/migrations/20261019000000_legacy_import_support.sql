-- Historical (Polypus) import support, Phase 1. Purely additive - no existing table, column, trigger or
-- constraint is touched except the one explicitly noted CHECK widen below. Nothing in this migration is
-- applied by the dry-run pipeline; it is drafted for review ahead of the controlled production import.
--
-- accounting_legacy_jobs: legacy Polypus jobs (Btater, KZ Residence, Kayfoun, AM Appartment, Chemlen, Souk El
-- Ghareb, State House Facade Revival, ...), one row per (book, legacy job). mapped_project_id stays NULL for
-- every legacy job unless a human has explicitly confirmed it corresponds to a real Control project - the
-- importer never sets this itself. This is what lets historical activity be fully reported on (money
-- received/spent, cash movements, payees, categories, journal history) WITHOUT ever creating a fake active
-- Control project (requirement 4).
create table accounting_legacy_jobs (
    id                bigint generated always as identity primary key,
    book_id           bigint not null references accounting_books(id) on delete restrict,
    legacy_job_id     bigint not null,
    legacy_job_code   text,
    legacy_job_name   text not null,
    mapped_project_id bigint references projects(id) on delete restrict,
    status            text not null default 'unmapped' check (status in ('unmapped', 'confirmed_mapping', 'closed_historical')),
    notes             text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (book_id, id),
    unique (book_id, legacy_job_id)
);

alter table accounting_legacy_jobs enable row level security;

-- accounting_journal_lines already has project_id (references projects) for CONFIRMED job mappings; this
-- adds the parallel, always-populated legacy_job_id so historical-only activity groups and reports the same
-- way even when no Control project exists. A line can carry EITHER, NEITHER (no job on the legacy line) or
-- BOTH (a confirmed-mapped job also gets its legacy_job_id recorded for full traceability).
alter table accounting_journal_lines add column legacy_job_id bigint;
alter table accounting_journal_lines
    add constraint accounting_journal_lines_book_legacy_job_fk
    foreign key (book_id, legacy_job_id) references accounting_legacy_jobs(book_id, id) on delete restrict;
create index accounting_journal_lines_legacy_job_idx on accounting_journal_lines(legacy_job_id) where legacy_job_id is not null;

-- One row per imported accounting_journal_lines row, preserving everything requirement 1 lists: the original
-- JVID, voucher type, reference, narration, legacy account, Base1(USD)/Base2(LBP)/derived FX rate, and native
-- currency/foreign amount where the legacy line actually carried one. Never touched by the app's own posting
-- service; read-only after the import writes it once. The unique constraint on (legacy_book_code,
-- legacy_voucher_entry_id) IS the "duplicate legacy IDs cannot be inserted twice" guarantee (requirement 10) -
-- enforced by Postgres itself, not application code.
create table accounting_legacy_journal_line_ref (
    id                      bigint generated always as identity primary key,
    journal_line_id         bigint not null unique references accounting_journal_lines(id) on delete restrict,
    legacy_source           text not null default 'polypus',
    legacy_book_code        text not null,
    legacy_jv_id             bigint not null,
    legacy_jv_number         bigint,
    legacy_voucher_entry_id  bigint not null,
    legacy_account_id        bigint not null,
    legacy_account_number    text,
    legacy_job_id_raw        bigint,
    legacy_jv_type_code      text,
    legacy_narration         text,
    legacy_reference         text,
    legacy_value_date        date,
    legacy_base1_amount      numeric(19,4) not null,
    legacy_base2_amount      numeric(19,4),
    legacy_base2_currency    text default 'LBP',
    legacy_fx_rate           numeric(19,10),
    legacy_native_currency_id bigint,
    legacy_native_amount     numeric(19,4),
    split_from_legacy_voucher boolean not null default false,
    import_batch_id          bigint,
    imported_at               timestamptz not null default now(),
    unique (legacy_book_code, legacy_voucher_entry_id)
);

create index accounting_legacy_journal_line_ref_jv_idx on accounting_legacy_journal_line_ref(legacy_book_code, legacy_jv_id);

alter table accounting_legacy_journal_line_ref enable row level security;

-- requirement 5: Omar, Ramadan and similar "Cash Partners" style parties are genuinely partners, not
-- workers/contractors/suppliers/consultants/employees/clients/government/other. Widening this CHECK is
-- additive and backward compatible - every existing row's kind is already in the new, larger allowed set.
-- CONSTRAINT NAME: confirmed against production (read-only pg_constraint query, 2026-09-28) as
-- 'accounting_counterparties_kind_check' - re-verify if this migration is applied significantly later, in
-- case Setup or another migration has since recreated the constraint under a different name.
alter table accounting_counterparties drop constraint accounting_counterparties_kind_check;
alter table accounting_counterparties add constraint accounting_counterparties_kind_check
    check (kind in ('worker', 'contractor', 'supplier', 'consultant', 'employee', 'client', 'government', 'partner', 'other'));
