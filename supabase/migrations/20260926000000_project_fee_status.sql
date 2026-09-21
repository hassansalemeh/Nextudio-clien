-- Fee status: a project's fee is either Pending (not confirmed, counts as $0 revenue) or Confirmed.
-- A pending project may have no fee at all, so total_fee becomes optional.

alter table projects add column fee_status text not null default 'confirmed'
    check (fee_status in ('pending', 'confirmed'));

-- Projects created before this migration already had a fee entered, so they stay confirmed.
-- New projects default to pending until the admin confirms the fee.
alter table projects alter column fee_status set default 'pending';

alter table projects alter column total_fee drop not null;

alter table projects add constraint projects_confirmed_needs_fee
    check (fee_status = 'pending' or total_fee is not null);
