-- Decommission Accounting: removes every accounting_* database object. Forward-only - the original
-- accounting migrations (20261013000000 through 20261021000000) are left untouched as historical record,
-- consistent with schema_migrations already recording them as applied.
--
-- Safety: every cross-boundary foreign key points FROM accounting_* INTO clients/employees/projects/app_users,
-- never the reverse (see the removal audit). Dropping these tables therefore cannot cascade into, lock, or
-- modify any row in a shared table. No shared table carries an accounting-specific column, trigger, or FK.
-- The old plain `transactions` table (pre-dates Accounting, still in active use) is explicitly out of scope
-- and is not touched here. btree_gist stays installed - it is used by time_entries' exclusion constraint.
--
-- Deliberately NOT using CASCADE anywhere: every statement below is a plain, dependency-restricted drop in
-- the exact topological order proved safe by the audit. If an object outside this list still depends on
-- something here, the statement - and the whole transaction - fails loudly instead of silently removing it.
--
-- No explicit BEGIN/COMMIT here: migrate.ts already wraps each migration file in its own transaction
-- (BEGIN ... file contents ... INSERT INTO schema_migrations ... COMMIT), same as every other migration
-- in this repository - adding this file's own would close that transaction early.

-- 1. Views first (they select from the tables dropped below)
drop view accounting_receivables_report;
drop view accounting_project_scope_report;

-- 2. Tables, strictly children before parents
drop table accounting_legacy_line_classification;   -- references accounting_journal_lines
drop table accounting_legacy_journal_line_ref;       -- references accounting_journal_lines
drop table accounting_journal_lines;                 -- references journal_entries/accounts/cash_accounts/counterparties/legacy_jobs
drop table accounting_transactions;                  -- references journal_entries/accounts/cash_accounts/counterparties
drop table accounting_audit_log;                     -- references accounting_books
drop table accounting_journal_entries;               -- referenced by journal_lines, transactions (both dropped above)
drop table accounting_cash_accounts;                 -- referenced by journal_lines, transactions (both dropped above)
drop table accounting_legacy_jobs;                   -- referenced by journal_lines, cash_accounts (both dropped above)
drop table accounting_counterparties;                -- referenced by journal_lines, transactions (both dropped above)
drop table accounting_accounts;                      -- referenced by journal_lines, transactions, cash_accounts (all dropped above)
drop table accounting_books;                         -- root: everything referencing it is already dropped

-- 3. Trigger functions last (their triggers were already removed automatically with their owning tables above)
drop function accounting_guard_account_identity();
drop function accounting_guard_cash_ledger();
drop function accounting_guard_group_posting();
drop function accounting_guard_journal_kind();
drop function accounting_guard_operating_transaction();
drop function accounting_guard_protected_line();
drop function accounting_preserve_fund_project();
