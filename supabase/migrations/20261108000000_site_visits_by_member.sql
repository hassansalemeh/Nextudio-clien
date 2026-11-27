-- Visitors for site visits are organization members, not just staff employees - an admin (owner/admin
-- in organization_members, e.g. mo@nextudio.co, omar@nextudio.co) has no employees row at all, so they
-- could never be picked in the site visit form. Members also get an optional display name, used when
-- they have no employee record (an admin's name today lives nowhere but their email).

alter table organization_members add column display_name text check (char_length(display_name) <= 100);

alter table site_visits add column member_id bigint;

update site_visits sv
set member_id = e.organization_member_id
from employees e
where e.id = sv.employee_id;

-- Fail loudly rather than silently drop data: a row whose employee has no organization_member_id (no
-- login) can't be mapped and must be resolved by hand before this migration can proceed.
do $$
declare
    unmapped bigint;
begin
    select count(*) into unmapped from site_visits where member_id is null;
    if unmapped > 0 then
        raise exception 'Cannot migrate % site_visits row(s) to member_id: their employee has no organization_member_id (no login). Resolve manually before re-running this migration.', unmapped;
    end if;
end $$;

alter table site_visits alter column member_id set not null;
alter table site_visits add constraint site_visits_member_same_org
    foreign key (organization_id, member_id) references organization_members (organization_id, id);

drop index site_visits_org_employee_date_idx;
alter table site_visits drop constraint site_visits_employee_id_fkey;
alter table site_visits drop column employee_id;

create index site_visits_org_member_date_idx on site_visits(organization_id, member_id, visit_date);
