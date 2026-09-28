-- Phase 1B: lets the posting service represent "incur a payable" style entries (Dr Project Cost /
-- Cr Supplier Payable) with no cash movement yet - money in/out/transfer are completely unchanged.
--
-- The 'non_cash' direction already existed in accounting_transactions.direction since Phase 1A, but the
-- posting service refused to use it: there was no column to name the CREDIT side of a non-cash entry
-- (category_account_id was only ever the one "category" leg alongside a cash leg). This adds exactly one
-- nullable column, contra_account_id, used only when direction = 'non_cash': category_account_id becomes the
-- debit side (e.g. Project Cost) and contra_account_id the credit side (e.g. Supplier Payable). "Settling"
-- that payable later needs no schema change at all - it is an ordinary money_out entry whose category account
-- happens to be the liability account instead of an expense account (Dr Supplier Payable / Cr Cash).
--
-- This intentionally does NOT touch the original (unnamed, auto-generated) check constraint from
-- 20261013000000_accounting_schema.sql - a second, additive check constraint is enough to require
-- contra_account_id whenever direction = 'non_cash', with no risk of mis-naming and dropping the wrong thing.

alter table accounting_transactions add column contra_account_id bigint;

alter table accounting_transactions
    add constraint accounting_transactions_book_contra_account_fk
    foreign key (book_id, contra_account_id) references accounting_accounts(book_id, id) on delete restrict;

alter table accounting_transactions
    add constraint accounting_transactions_non_cash_contra_check
    check ((direction = 'non_cash' and contra_account_id is not null and contra_account_id <> category_account_id)
        or (direction <> 'non_cash' and contra_account_id is null));

create index accounting_transactions_contra_account_idx on accounting_transactions(contra_account_id) where contra_account_id is not null;
