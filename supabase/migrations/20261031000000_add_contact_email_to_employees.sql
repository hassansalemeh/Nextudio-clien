-- An optional notification address for an employee - separate from their login email (app_users.email),
-- which this never changes. Used to reach the employee directly, e.g. the daily work-submission reminder.
alter table employees add column contact_email text;
