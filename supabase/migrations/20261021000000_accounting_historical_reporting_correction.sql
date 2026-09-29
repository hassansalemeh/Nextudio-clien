-- Historical reporting correction (Phase 2 of the Polypus import). Purely additive: no existing debit,
-- credit, account_id, date, legacy AccountID/JobID, or source reference is touched anywhere in this
-- migration. Implements the specification from the 100% historical coverage audit (chat history,
-- 2026-09-29): split the collapsed cash/bank identity back to its original Polypus pots, and give every
-- historical journal line a reviewable, persisted management classification instead of letting reports
-- trust the generic imported account/target code blindly.

-- 1. Lets one collapsed ledger account (AST-CASH/AST-BANK/AST-PETTY) expose multiple cash-account dimension
-- rows, one per distinct original Polypus cash/bank pot (Cash Nextudio $, Cash Btater $, Cash KZ Residence,
-- Cash AM, Cash Savings, Bank Nextudio $, Bank Card Internet $, Bank Ethiopia, Petty Cash Nextudio $, Whish
-- Acc, ...), and optionally links a pot to the legacy job it belonged to, for per-job fund reporting
-- (Client Funds Received / Project Costs Paid / Remaining Project Funds). The generic ledger account
-- (account_id) is unchanged - this only affects the cash_account_id dimension, exactly like the original
-- accounting-backfill-cash-accounts.ts did.
alter table accounting_cash_accounts add column legacy_account_id bigint;
alter table accounting_cash_accounts add column legacy_job_id bigint references accounting_legacy_jobs(id) on delete restrict;
create unique index accounting_cash_accounts_book_legacy_account_uk
    on accounting_cash_accounts(book_id, legacy_account_id) where legacy_account_id is not null;

-- 2. The canonical, reviewable management classification for every historical (imported) journal line -
-- computed once by server/src/scripts/accounting-classify-legacy-lines.ts directly from the two Polypus
-- dumps, using the same structural evidence as the audit (account number/type, JobID, voucher type, RCV
-- receipt/payment records, and matching-deposit-amount evidence) - narration only supports, never overrides,
-- that evidence. This table NEVER touches accounting_journal_lines.debit/credit/account_id; it is purely an
-- annotation read by reporting queries. status is exactly one of VERIFIED / PRESERVED_AMBIGUOUS /
-- MAPPING_ERROR - there is no "assumed" status, so an item the evidence cannot resolve stays visibly
-- PRESERVED_AMBIGUOUS rather than being guessed into a category.
create table accounting_legacy_line_classification (
    id              bigint generated always as identity primary key,
    journal_line_id bigint not null unique references accounting_journal_lines(id) on delete restrict,
    semantic_class  text not null,
    status          text not null check (status in ('VERIFIED', 'PRESERVED_AMBIGUOUS', 'MAPPING_ERROR')),
    note            text,
    classified_at   timestamptz not null default now()
);
create index accounting_legacy_line_classification_class_idx on accounting_legacy_line_classification(semantic_class);
create index accounting_legacy_line_classification_status_idx on accounting_legacy_line_classification(status);
alter table accounting_legacy_line_classification enable row level security;
