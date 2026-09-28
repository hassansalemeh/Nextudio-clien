-- Phase 1B: close protected-account posting gaps. No chart, balance or historical-row changes.
-- Projects are shared Control records: project-fund setup establishes their association with a book.
-- Inactive funds remain valid associations. Importers must establish funds before importing liabilities.

-- Stop for explicit reconciliation if historical protected postings violate the new rules. Do not
-- rewrite their project/kind or install guards that would strand their reversal workflow.
do $$
begin
    if exists (
        select 1 from accounting_journal_lines jl
        join accounting_accounts a on a.id = jl.account_id
        join accounting_journal_entries je on je.id = jl.journal_entry_id
        where (a.code = 'LIA-CLIENTFUNDS' and (jl.project_id is null or not exists (
            select 1 from accounting_cash_accounts ca where ca.book_id = jl.book_id
                and ca.project_id = jl.project_id and ca.kind = 'project_fund'
        ))) or (a.code = 'EQ-OPENING' and je.entry_kind <> 'opening_balance')
    ) then
        raise exception 'Review historical protected-account postings before migration: client-funds project/book or opening journal kind is invalid';
    end if;
    if exists (
        select 1 from accounting_transactions t where exists (
            select 1 from accounting_accounts a where a.book_id = t.book_id and a.code = 'EQ-OPENING'
                and a.id in (t.category_account_id, t.contra_account_id, t.classification_account_id)
        ) or exists (select 1 from accounting_journal_entries je where je.id = t.journal_entry_id and je.entry_kind = 'opening_balance')
        or exists (
            select 1 from accounting_accounts a where a.book_id = t.book_id and a.code = 'LIA-CLIENTFUNDS'
                and a.id in (t.category_account_id, t.contra_account_id)
                and (t.project_id is null or not exists (select 1 from accounting_cash_accounts ca
                    where ca.book_id = t.book_id and ca.project_id = t.project_id and ca.kind = 'project_fund'))
        )
    ) then
        raise exception 'Review historical operating transactions using protected accounts before migration';
    end if;
end $$;

create function accounting_guard_protected_line() returns trigger language plpgsql as $$
declare account_code text;
declare journal_kind text;
begin
    select code into account_code from accounting_accounts where id = new.account_id and book_id = new.book_id;
    if account_code = 'LIA-CLIENTFUNDS' then
        if new.project_id is null then
            raise exception 'LIA-CLIENTFUNDS requires a project in this accounting book' using errcode = '23514';
        end if;
        -- A key-share lock also prevents the last association from disappearing during this insert.
        perform id from accounting_cash_accounts
        where book_id = new.book_id and project_id = new.project_id and kind = 'project_fund'
        order by id limit 1 for key share;
        if not found then
            raise exception 'LIA-CLIENTFUNDS project is not associated with this accounting book' using errcode = '23514';
        end if;
    end if;
    if account_code = 'EQ-OPENING' then
        select entry_kind into journal_kind from accounting_journal_entries
        where id = new.journal_entry_id and book_id = new.book_id for share;
        if journal_kind is distinct from 'opening_balance' then
            raise exception 'EQ-OPENING requires the dedicated opening/migration journal kind' using errcode = '23514';
        end if;
    end if;
    return new;
end $$;
create trigger accounting_protected_line_guard before insert or update on accounting_journal_lines
    for each row execute function accounting_guard_protected_line();

-- No ordinary transaction may disguise itself as an opening by linking to an opening-kind journal.
-- Reversals of openings are journal-only too and preserve that kind, so they continue to work.
create function accounting_guard_operating_transaction() returns trigger language plpgsql as $$
begin
    if exists (select 1 from accounting_accounts a where a.book_id = new.book_id and a.code = 'EQ-OPENING'
        and a.id in (new.category_account_id, new.contra_account_id, new.classification_account_id)) then
        raise exception 'EQ-OPENING is forbidden in operating transactions' using errcode = '23514';
    end if;
    if new.journal_entry_id is not null then
        perform id from accounting_journal_entries where id = new.journal_entry_id
            and entry_kind = 'opening_balance' for share;
        if found then
            raise exception 'Operating transactions cannot link to opening/migration journals' using errcode = '23514';
        end if;
    end if;
    if exists (select 1 from accounting_accounts a where a.book_id = new.book_id and a.code = 'LIA-CLIENTFUNDS'
        and a.id in (new.category_account_id, new.contra_account_id)) then
        if new.project_id is null or not exists (select 1 from accounting_cash_accounts ca
            where ca.book_id = new.book_id and ca.project_id = new.project_id and ca.kind = 'project_fund') then
            raise exception 'LIA-CLIENTFUNDS requires a project in this accounting book' using errcode = '23514';
        end if;
    end if;
    return new;
end $$;
create trigger accounting_operating_transaction_guard before insert or update on accounting_transactions
    for each row execute function accounting_guard_operating_transaction();

-- Prevent changing a journal's kind after creation to bypass either guard. Import paths must choose
-- the correct kind up front; no runtime API allows clients to choose an ordinary transaction's kind.
create function accounting_guard_journal_kind() returns trigger language plpgsql as $$
begin
    if new.entry_kind is distinct from old.entry_kind then
        raise exception 'Journal entry kind is immutable' using errcode = '23514';
    end if;
    return new;
end $$;
create trigger accounting_journal_kind_guard before update on accounting_journal_entries
    for each row execute function accounting_guard_journal_kind();

-- Fund identity is already immutable. Preserve its book/project association after it has been used
-- on a funds-held line; deactivate funds rather than deleting them. This also preserves reversibility.
create function accounting_preserve_fund_project() returns trigger language plpgsql as $$
begin
    if old.kind = 'project_fund' and exists (
        select 1 from accounting_journal_lines jl join accounting_accounts a on a.id = jl.account_id
        where jl.book_id = old.book_id and jl.project_id = old.project_id and a.code = 'LIA-CLIENTFUNDS'
    ) then
        raise exception 'Deactivate project funds with client-funds history instead of deleting them' using errcode = '23514';
    end if;
    return old;
end $$;
create trigger accounting_preserve_fund_project_guard before delete on accounting_cash_accounts
    for each row execute function accounting_preserve_fund_project();
