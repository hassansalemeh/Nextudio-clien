-- Site workers: external, temporary workers paid per hour instead of a monthly salary. They never log in -
-- an admin enters their hours for them. monthly_salary stays not null (0 for a site worker); hourly_rate is
-- only ever set for a site worker.
alter table employees add column kind text not null default 'staff' check (kind in ('staff', 'site_worker'));
alter table employees add column hourly_rate numeric(12,4) check (hourly_rate >= 0);
alter table employees add constraint employees_site_worker_has_hourly_rate
  check (kind <> 'site_worker' or hourly_rate is not null);
