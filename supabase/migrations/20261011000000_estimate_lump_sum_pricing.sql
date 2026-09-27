-- A second estimate pricing mode: Lump Sum. The admin still writes separate titled service/scope sections
-- (estimate_items / invoice_items are unchanged), but the subtotal comes from one fee instead of the line
-- amounts. Existing quantity/unit/unit_price on each row are left exactly as they are either way, so toggling
-- an estimate between Itemized and Lump Sum never loses or rewrites them.

alter table estimates
    add column pricing_method text not null default 'itemized' check (pricing_method in ('itemized', 'lump_sum')),
    add column lump_sum_fee   numeric(14,2) not null default 0 check (lump_sum_fee >= 0);

alter table invoices
    add column pricing_method text not null default 'itemized' check (pricing_method in ('itemized', 'lump_sum')),
    add column lump_sum_fee   numeric(14,2) not null default 0 check (lump_sum_fee >= 0);
