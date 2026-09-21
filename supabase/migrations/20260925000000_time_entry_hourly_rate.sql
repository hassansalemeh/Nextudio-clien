-- Each time entry keeps the hourly labor rate it was recorded with, so later salary changes
-- never rewrite the cost of past work.

alter table time_entries add column hourly_rate_snapshot numeric(12,4);

-- Backfill entries recorded before this column existed, using the employee's current salary / 176
update time_entries
set hourly_rate_snapshot = round(employees.monthly_salary / 176, 4)
from employees
where employees.id = time_entries.employee_id;

alter table time_entries alter column hourly_rate_snapshot set not null;
alter table time_entries add constraint time_entries_rate_nonnegative check (hourly_rate_snapshot >= 0);
