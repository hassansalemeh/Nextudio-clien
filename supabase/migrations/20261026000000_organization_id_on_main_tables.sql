-- =====================================================================
-- Multi-tenant, migration 2: every main table belongs to an organization.
--
-- Still the "expand" phase: the live app keeps working unchanged.
-- The app does not send organization_id yet, so each new column gets a
-- temporary DEFAULT (Nextudio). New rows created by the current code are
-- therefore automatically Nextudio's. The default and its helper function
-- are removed in the cleanup step, after the backend sends the real
-- organization for every insert.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Temporary helper: the id of Nextudio (used only as a default)
-- ---------------------------------------------------------------------
create function default_organization_id() returns bigint
language sql stable as $$
  select id from organizations where name = 'Nextudio'
$$;


-- ---------------------------------------------------------------------
-- 2. Add organization_id to the 11 main tables.
--    For each table, the loop does the same 5 things:
--      a. add the column, pointing to organizations
--      b. mark every existing row as Nextudio's
--      c. make the column required (every row must belong to a company)
--      d. set the temporary default for rows the current app creates
--      e. add an index, so "only this company's rows" stays fast
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'projects', 'employees', 'estimates', 'invoices', 'payments',
    'suppliers', 'categories', 'money_locations', 'money_movements', 'auth_sessions'
  ]
  loop
    execute format('alter table %I add column organization_id bigint references organizations(id) on delete restrict', t);
    execute format('update %I set organization_id = default_organization_id()', t);
    execute format('alter table %I alter column organization_id set not null', t);
    execute format('alter table %I alter column organization_id set default default_organization_id()', t);
    execute format('create index %I on %I (organization_id)', t || '_organization_id_idx', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Uniqueness rules become "unique within one company"
-- ---------------------------------------------------------------------

-- Estimate numbers (ignoring capitals)
drop index estimates_number_key;
create unique index estimates_number_key
  on estimates (organization_id, lower(estimate_number));

-- Invoice numbers
alter table invoices drop constraint invoices_invoice_number_key;
alter table invoices add constraint invoices_invoice_number_key
  unique (organization_id, invoice_number);

-- Category names
alter table categories drop constraint categories_name_key;
alter table categories add constraint categories_name_key
  unique (organization_id, name);

-- Supplier names (ignoring capitals and spaces)
drop index suppliers_unique_name;
create unique index suppliers_unique_name
  on suppliers (organization_id, lower(trim(name)));


-- ---------------------------------------------------------------------
-- 4. A project's automatic site fund belongs to the project's company
-- ---------------------------------------------------------------------
create or replace function create_site_fund_for_project() returns trigger
language plpgsql as $$
begin
  insert into money_locations (name, kind, project_id, organization_id)
  values (new.name || ' - Site fund', 'site_fund', new.id, new.organization_id);
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Report views carry organization_id (added as the last column)
-- ---------------------------------------------------------------------
create or replace view location_balances as
select
  l.id,
  l.name,
  l.kind,
  l.currency,
  l.project_id,
  coalesce(sum(
    case
      when m.type = 'in'       and m.location_id    = l.id then  m.amount
      when m.type = 'out'      and m.location_id    = l.id then -m.amount
      when m.type = 'transfer' and m.location_id    = l.id then -m.amount
      when m.type = 'transfer' and m.to_location_id = l.id then  m.amount
    end
  ), 0) as balance,
  l.organization_id
from money_locations l
left join money_movements m
  on m.location_id = l.id or m.to_location_id = l.id
where l.is_active
group by l.id;

create or replace view project_monthly_summary as
select
  m.project_id,
  date_trunc('month', m.movement_date)::date as month,
  sum(case when m.type = 'in'  then m.amount else 0 end) as money_in,
  sum(case when m.type = 'out' then m.amount else 0 end) as money_out,
  m.organization_id
from money_movements m
where m.project_id is not null
  and m.type in ('in', 'out')
group by m.organization_id, m.project_id, date_trunc('month', m.movement_date);

create or replace view supplier_project_totals as
with paid as (
  select project_id, supplier_id, sum(amount) as total_paid
  from money_movements
  where type = 'out' and supplier_id is not null and project_id is not null
  group by project_id, supplier_id
),
agreed as (
  select project_id, supplier_id, sum(agreed_amount) as total_agreed
  from supplier_agreements
  group by project_id, supplier_id
)
select
  coalesce(p.project_id, a.project_id)   as project_id,
  coalesce(p.supplier_id, a.supplier_id) as supplier_id,
  coalesce(a.total_agreed, 0)            as total_agreed,
  coalesce(p.total_paid, 0)              as total_paid,
  coalesce(a.total_agreed, 0) - coalesce(p.total_paid, 0) as remaining,
  pr.organization_id
from paid p
full outer join agreed a
  on a.project_id = p.project_id and a.supplier_id = p.supplier_id
join projects pr
  on pr.id = coalesce(p.project_id, a.project_id);
