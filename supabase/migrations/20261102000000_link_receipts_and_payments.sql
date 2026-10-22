-- Links each receipt to exactly one payment. The payment is the single source of truth for
-- amount/date/project; the receipt is the signed, printable proof of it. Nullable only because
-- the one receipt created before this link existed has no payment to point to.
alter table receipts
  add column payment_id bigint unique references payments(id) on delete restrict;

-- All money is USD. The column stays (so a future multi-currency reopening doesn't need a migration
-- to bring it back), but only 'USD' is accepted from here on.
alter table receipts drop constraint if exists receipts_currency_check;
alter table receipts add constraint receipts_currency_usd check (currency = 'USD');
