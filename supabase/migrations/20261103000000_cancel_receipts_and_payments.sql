-- Receipts and payments are never hard-deleted. Cancelling records who/why/when instead of removing
-- the row, so the receipt number is never reused and the audit trail stays intact.

alter table receipts
  add column cancelled_at  timestamptz,
  add column cancelled_by  bigint references app_users(id) on delete set null,
  add column cancel_reason text;

alter table receipts add constraint receipts_cancel_fields_together
  check (
    (cancelled_at is null and cancelled_by is null and cancel_reason is null) or
    (cancelled_at is not null and cancelled_by is not null and cancel_reason is not null)
  );

alter table payments
  add column cancelled_at  timestamptz,
  add column cancelled_by  bigint references app_users(id) on delete set null,
  add column cancel_reason text;

alter table payments add constraint payments_cancel_fields_together
  check (
    (cancelled_at is null and cancelled_by is null and cancel_reason is null) or
    (cancelled_at is not null and cancelled_by is not null and cancel_reason is not null)
  );

-- Partial indexes: cheap "is this cancelled" filtering without indexing the common (not-cancelled) case
create index receipts_cancelled_at_idx on receipts(cancelled_at) where cancelled_at is not null;
create index payments_cancelled_at_idx on payments(cancelled_at) where cancelled_at is not null;
