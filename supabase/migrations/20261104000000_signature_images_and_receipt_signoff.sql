-- Part 3: per-organization document signers and stamps. Each company manages its own list of signers
-- (never a fixed, hardcoded list) and its own PAID / company stamp images. Kept in the database, not on
-- local disk - this app's hosts (Railway's container, GoDaddy shared hosting) don't guarantee a file
-- written at runtime survives the next redeploy, the way the Postgres database does.

create table document_signers (
    id              bigint generated always as identity primary key,
    organization_id bigint not null references organizations(id) on delete restrict,
    display_name    text not null,
    -- Both null until a signature is uploaded; always set together
    mime_type       text check (mime_type in ('image/png', 'image/jpeg')),
    image           bytea,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    updated_by      bigint references app_users(id) on delete set null,

    check ((image is null) = (mime_type is null)),
    -- lets receipts.issued_by_signer_id/received_by_signer_id guarantee "my signer is my own company's"
    constraint document_signers_org_id_key unique (organization_id, id)
);

create unique index document_signers_org_name_key on document_signers(organization_id, lower(display_name));
alter table document_signers enable row level security;

-- Nextudio's two signers today, without images yet - uploaded afterwards from the Signatures & Stamps page
insert into document_signers (organization_id, display_name)
select o.id, signer.name
from organizations o
cross join (values ('Mohamad Omar'), ('Mohamad Ramadan')) as signer(name)
where o.name = 'Nextudio';


-- One PAID stamp and one company stamp per organization
create table organization_stamps (
    id              bigint generated always as identity primary key,
    organization_id bigint not null references organizations(id) on delete restrict,
    kind            text not null check (kind in ('paid_stamp', 'company_stamp')),
    -- Both null until uploaded; always set together
    mime_type       text check (mime_type in ('image/png', 'image/jpeg')),
    image           bytea,
    updated_at      timestamptz not null default now(),
    updated_by      bigint references app_users(id) on delete set null,

    check ((image is null) = (mime_type is null))
);

create unique index organization_stamps_org_kind_key on organization_stamps(organization_id, kind);
alter table organization_stamps enable row level security;


-- Part 4: the receipt's own two-signer sign-off. issued_by_signer_id/received_by_signer_id link to
-- document_signers with a same-organization guarantee (a receipt can never point at another company's
-- signer) - the same composite-FK pattern as project_members. issued_by_admin (already live) and the new
-- received_by_admin are each a text SNAPSHOT of the chosen signer's display_name at the moment the
-- receipt was issued, so renaming or deactivating a signer later never changes what an already-issued
-- receipt says. The signer_id columns and received_by_admin are all nullable: the two pre-existing
-- receipts (NEX-REC-0001, NEX-REC-0002) keep working from their existing issued_by_admin text alone.
alter table receipts
  add column issued_by_signer_id   bigint,
  add column received_by_signer_id bigint,
  add column received_by_admin     text,
  add column show_paid_stamp       boolean not null default true,
  add column show_company_stamp    boolean not null default true;

alter table receipts add constraint receipts_issued_by_signer_same_org
  foreign key (organization_id, issued_by_signer_id) references document_signers (organization_id, id);
alter table receipts add constraint receipts_received_by_signer_same_org
  foreign key (organization_id, received_by_signer_id) references document_signers (organization_id, id);
