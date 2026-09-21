-- Estimate editor: line item units, percentage/fixed discount, optional link to an existing project.

alter table estimate_items
    add column unit text not null default 'sqm'
        check (unit in ('sqm', 'lm', 'ls', 'pc', 'm3', 'sheet'));

alter table estimates
    add column discount_type text not null default 'fixed' check (discount_type in ('fixed', 'percent')),
    add column discount_value numeric(14,2) not null default 0 check (discount_value >= 0),
    -- an existing (e.g. Pending) project this estimate belongs to; used when the estimate is approved
    add column project_id bigint references projects(id) on delete set null,
    add column approved_at timestamptz;
