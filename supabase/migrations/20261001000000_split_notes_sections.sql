-- Quotation / invoice terms are split into their own sections.
-- `notes` remains the general "Notes" section; the other three are new.

alter table estimates
    add column payment_terms text,
    add column timeline      text,
    add column exclusions    text;

alter table invoices
    add column payment_terms text,
    add column timeline      text,
    add column exclusions    text;
