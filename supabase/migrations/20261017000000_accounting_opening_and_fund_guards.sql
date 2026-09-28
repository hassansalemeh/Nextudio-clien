-- Phase 1B only. No balances or chart rows are inserted by this migration.
-- Old journal currency remains derivable from its transaction/book; all new service postings persist it.
alter table accounting_journal_entries
    add column currency_code text check (currency_code ~ '^[A-Z]{3}$'),
    add column entry_kind text not null default 'standard' check (entry_kind in ('standard', 'opening_balance'));

-- Do not silently remap any existing Phase 1A fund or rewrite its posted history. A conflicting mapping
-- stops migration for review. Non-fund cash accounts may retain their existing shared ledger mappings.
do $$
begin
    if exists (
        select 1 from accounting_cash_accounts f
        join accounting_accounts a on a.id = f.ledger_account_id
        where f.kind = 'project_fund' and (a.code = 'AST-PROJFUND' or a.type <> 'asset' or exists (
            select 1 from accounting_cash_accounts c where c.ledger_account_id = f.ledger_account_id and c.id <> f.id
        ))
    ) then
        raise exception 'Existing project funds need dedicated asset ledgers; review mappings before migrating';
    end if;
end $$;

create function accounting_guard_cash_ledger() returns trigger language plpgsql as $$
declare ledger accounting_accounts%rowtype;
begin
    if TG_OP = 'UPDATE' then
        if (new.ledger_account_id, new.book_id, new.kind, new.project_id, new.currency_code)
            is distinct from (old.ledger_account_id, old.book_id, old.kind, old.project_id, old.currency_code) then
            raise exception 'Cash account ledger, book, kind, project and currency are immutable';
        end if;
    end if;
    select * into ledger from accounting_accounts where id = new.ledger_account_id for update;
    if ledger.type <> 'asset' or ledger.code = 'AST-PROJFUND' then
        raise exception 'Cash accounts require an asset posting ledger, not a grouping account';
    end if;
    if exists (select 1 from accounting_cash_accounts c where c.ledger_account_id = new.ledger_account_id
        and c.id <> new.id and (new.kind = 'project_fund' or c.kind = 'project_fund')) then
        raise exception 'A project fund ledger cannot be shared with another cash account';
    end if;
    return new;
end $$;
create trigger accounting_cash_ledger_guard before insert or update on accounting_cash_accounts
    for each row execute function accounting_guard_cash_ledger();

-- The reserved grouping account can never receive a direct posting, including an opening entry.
create function accounting_guard_group_posting() returns trigger language plpgsql as $$
begin
    if exists (select 1 from accounting_accounts where id = new.account_id and code = 'AST-PROJFUND') then
        raise exception 'AST-PROJFUND is a grouping account and cannot receive journal lines';
    end if;
    if exists (select 1 from accounting_cash_accounts where ledger_account_id = new.account_id
        and kind = 'project_fund' and id is distinct from new.cash_account_id) then
        raise exception 'Project fund ledger postings must identify their matching cash account';
    end if;
    return new;
end $$;
create trigger accounting_group_posting_guard before insert on accounting_journal_lines
    for each row execute function accounting_guard_group_posting();

-- Preserve the meaning of posted and cash-linked accounts and the reserved Phase 1B account codes.
create function accounting_guard_account_identity() returns trigger language plpgsql as $$
begin
    if new.code is distinct from old.code and (old.code in ('AST-PROJFUND', 'EQ-OPENING', 'LIA-CLIENTFUNDS')
        or new.code in ('AST-PROJFUND', 'EQ-OPENING', 'LIA-CLIENTFUNDS')) then
        raise exception 'Reserved accounting codes cannot be changed';
    end if;
    if new.type is distinct from old.type and (
        old.code in ('AST-PROJFUND', 'EQ-OPENING', 'LIA-CLIENTFUNDS')
        or exists (select 1 from accounting_cash_accounts where ledger_account_id = old.id)
        or exists (select 1 from accounting_journal_lines where account_id = old.id)
    ) then
        raise exception 'Cannot change the type of a reserved, posted or cash-linked account';
    end if;
    return new;
end $$;
create trigger accounting_account_identity_guard before update on accounting_accounts
    for each row execute function accounting_guard_account_identity();

alter table accounting_accounts add constraint accounting_reserved_account_types check (
    (code is distinct from 'AST-PROJFUND' or type = 'asset') and
    (code is distinct from 'EQ-OPENING' or type = 'equity') and
    (code is distinct from 'LIA-CLIENTFUNDS' or type = 'liability')
);
