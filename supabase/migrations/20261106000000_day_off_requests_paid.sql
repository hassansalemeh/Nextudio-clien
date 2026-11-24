-- Whether a day off was paid. Defaults to true, so every existing row (requested/approved before this
-- feature existed) becomes paid without needing a separate backfill.
alter table day_off_requests add column is_paid boolean not null default true;
