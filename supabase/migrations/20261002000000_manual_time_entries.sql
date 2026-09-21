-- Manual work entries: an employee adds time they forgot to record with the timer.
-- They are ordinary rows in time_entries (same hours, labor cost and overlap rules); these columns only describe them.

alter table time_entries
    add column description text,
    add column source text not null default 'timer' check (source in ('timer', 'manual'));
