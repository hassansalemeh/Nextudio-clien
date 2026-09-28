-- The two accounting books. No chart of accounts, cash accounts or counterparties are seeded here - the
-- legacy Polypus chart is mapped/imported in a later phase; Setup starts with these two books and nothing else.

insert into accounting_books (code, name, currency_code) values
    ('NEXTUDIO', 'Nextudio', 'USD'),
    ('NEXTUDIO_SARL', 'Nextudio SARL', 'USD');
