-- Manual work entries for a project the employee is not yet assigned to are held for admin
-- review instead of being rejected outright. They must not count as hours or labor cost anywhere
-- until an admin approves them (and creates the matching work assignment at the same time).

alter table time_entries
    add column status text not null default 'approved' check (status in ('approved', 'pending', 'rejected'));

-- Fast lookup of the (usually few) rows an admin still needs to review
create index time_entries_status_idx on time_entries(status) where status <> 'approved';
