-- Invoices issued before this system existed (e.g. from Wave) have no estimate behind them.
-- estimate_id stays unique, so an estimate still can only ever produce one invoice.

alter table invoices alter column estimate_id drop not null;
