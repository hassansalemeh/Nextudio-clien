-- Read-only comparison: what the OLD global sequences would give next vs. what the NEW per-company
-- method gives next, for Nextudio (change the organization name if you want to check another company).
-- Neither query calls nextval() or writes anything.

-- 1. OLD: reading sequence state directly (selecting from a sequence as a relation does not advance it,
--    unlike `select nextval(...)`, which would).
select
  'invoice_number_seq'::text as sequence_name,
  (case when is_called then last_value + increment_by else last_value end) as next_value,
  'NEX-INV-' || lpad((case when is_called then last_value + increment_by else last_value end)::text, 4, '0') as next_number_old_method
from invoice_number_seq
union all
select
  'client_funds_invoice_number_seq',
  (case when is_called then last_value + increment_by else last_value end),
  'NEX-CF-' || lpad((case when is_called then last_value + increment_by else last_value end)::text, 4, '0')
from client_funds_invoice_number_seq;

-- 2. NEW: highest trailing number already used by this company (per invoice_type), plus one.
with target_org as (
  select id from organizations where name = 'Nextudio'
)
select
  'professional_services'::text as invoice_kind,
  coalesce(max((regexp_match(i.invoice_number, '(\d+)\s*$'))[1]::int), 0) + 1 as next_value,
  'NEX-INV-' || lpad((coalesce(max((regexp_match(i.invoice_number, '(\d+)\s*$'))[1]::int), 0) + 1)::text, 4, '0') as next_number_new_method
from target_org o
left join invoices i on i.organization_id = o.id and i.invoice_type = 'professional_services'
union all
select
  'client_funds',
  coalesce(max((regexp_match(i.invoice_number, '(\d+)\s*$'))[1]::int), 0) + 1,
  'NEX-CF-' || lpad((coalesce(max((regexp_match(i.invoice_number, '(\d+)\s*$'))[1]::int), 0) + 1)::text, 4, '0')
from target_org o
left join invoices i on i.organization_id = o.id and i.invoice_type = 'client_funds';
