-- Client editing, per-document client snapshots, multilingual documents, and the Professional
-- Services Invoice's contract / Acceptance & Signatures section.
--
-- Client snapshots: estimates and invoices each keep their own copy of the client's name, contact
-- email/phone and address, taken when the client is selected. Editing the master Client record
-- must only affect quotations created afterward, never a quotation or invoice that already exists.
-- (contact_name already works this way - its own column, prefilled once, freely editable afterward.)

alter table clients add column address text;

alter table estimates
    add column client_name    text,
    add column client_email   text,
    add column client_phone   text,
    add column client_address text,
    add column document_language text not null default 'en' check (document_language in ('en', 'fr', 'ar'));

alter table invoices
    add column client_name    text,
    add column client_email   text,
    add column client_phone   text,
    add column client_address text,
    add column document_language text not null default 'en' check (document_language in ('en', 'fr', 'ar')),
    -- Professional Services Invoice contract / Acceptance & Signatures. Never shown on an Estimate,
    -- and never shown on a Client Funds invoice (invoice_type <> 'professional_services').
    add column contract_terms                text,
    add column client_representative_name    text,
    add column client_representative_title   text,
    add column nextudio_representative_name  text,
    add column nextudio_representative_title text;

-- Backfill: existing rows never had a frozen snapshot (client name/email/phone were read live via a
-- join), so give them their best-effort historical value from today's client record. From this point
-- on, editing a client no longer changes any estimate/invoice that already exists.
update estimates set
    client_name = clients.name, client_email = clients.email, client_phone = clients.phone, client_address = clients.address
from clients where clients.id = estimates.client_id;

update invoices set
    client_name = clients.name, client_email = clients.email, client_phone = clients.phone, client_address = clients.address
from clients where clients.id = invoices.client_id;
