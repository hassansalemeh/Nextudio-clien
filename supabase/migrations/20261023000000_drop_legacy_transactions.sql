-- Drops the legacy `transactions` table (created 20260918000000_create_transactions.sql). This predates
-- even the since-removed Accounting module and was superseded by the current, actively-used `payments`
-- table. Its only frontend page (FinancePage.tsx) had been commented out of routing for a while; removed
-- here along with its server routes and the project-delete cleanup step that referenced it.
--
-- Safety: the only foreign key involving this table is transactions.project_id -> projects.id (outward,
-- RESTRICT) - nothing references INTO `transactions`. The `receipts` table once did (20260919000000), but
-- that table was itself dropped in 20260921000000_drop_receipts.sql, long before this migration. Confirmed
-- against the live schema immediately before writing this file: zero rows, zero incoming references.
--
-- No CASCADE: a plain drop, so an unexpected dependency fails the migration instead of silently cascading.
--
-- No explicit BEGIN/COMMIT here: migrate.ts already wraps each migration file in its own transaction.

drop table transactions;
