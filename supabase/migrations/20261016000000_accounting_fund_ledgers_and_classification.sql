-- Phase 1B fixes, still additive only:
--
-- 1. accounting_accounts.parent_id lets a "grouping/control" account (e.g. Project Funds / Project Cash)
--    hold individual, independently-postable child ledger accounts (e.g. DNT Cash, SBM Cash) underneath it -
--    each project fund gets its OWN dedicated asset ledger account, never sharing one with another project,
--    so a Cash/Account Statement for DNT Cash can never mix in SBM Cash's activity. The parent itself is
--    never posted to directly for a project fund; it exists purely so Trial Balance and Setup can group
--    the funds together for readability.
--
-- 2. accounting_transactions.classification_account_id is a reporting TAG, never a posted journal line. It
--    exists for exactly one situation: disbursing money already held for a client/project (Dr the Client
--    Project Funds Held liability / Cr cash) still needs a "Concrete Works" / "Steel" / etc. classification
--    for management reporting, WITHOUT that classification account ever being the thing actually debited -
--    doing that would wrongly imply the disbursement is a Nextudio expense. category_account_id remains the
--    one REAL account posted to; classification_account_id is purely descriptive, and is only meaningful
--    alongside money_in/money_out (never transfer or non_cash, which don't carry this kind of dimension).

alter table accounting_accounts add column parent_id bigint;

alter table accounting_accounts
    add constraint accounting_accounts_book_parent_fk
    foreign key (book_id, parent_id) references accounting_accounts(book_id, id) on delete restrict;

create index accounting_accounts_parent_idx on accounting_accounts(parent_id) where parent_id is not null;

alter table accounting_transactions add column classification_account_id bigint;

alter table accounting_transactions
    add constraint accounting_transactions_book_classification_fk
    foreign key (book_id, classification_account_id) references accounting_accounts(book_id, id) on delete restrict;

alter table accounting_transactions
    add constraint accounting_transactions_classification_direction_check
    check (classification_account_id is null or direction in ('money_out', 'money_in'));

create index accounting_transactions_classification_idx on accounting_transactions(classification_account_id) where classification_account_id is not null;
