# Phase 1B review — uncommitted, not deployed

Phase 1A migrations and deployed behavior were retained. No production connection, production migration,
seed apply, real opening balance, commit, push or deployment was performed in this continuation.

## Work inherited

The initial working tree contained 17 modified tracked files and four untracked files. Existing work included:

- NEXTUDIO/NEXTUDIO SARL chart definitions and a default-dry-run seeder, identified by stable codes.
- Setup tabs for Accounts, Categories, Cash & Bank, Project Funds, Payees and Posting Rules.
- Bill / Payable posting, contra accounts, reversal support, and migration `20261015000000`.
- A draft project-fund ledger resolver, parent grouping, classification tags, and migration `20261016000000`.
- A Client Fund Disbursement tab and classification display on project/payee history.
- An opening-balance parser, service and admin route.
- Draft smoke scenarios for funds, disbursements, openings and the requested $1,000/$400 payable.

The drafted tests were not yet runnable end-to-end: their exported-function assertion omitted the new
opening functions. Money Out also omitted payable liabilities from its Purpose choices. Other gaps were
ledger reuse per project instead of per fund, editable ledger mappings, missing grouping-post guards,
opening amounts permitted on P&L accounts, ambiguous cash attribution, and opening currency recorded only
in audit data.

## Revised chart

The seeder creates accounts only. It does not create projects, funds, transactions or opening balances.
It preserves existing accounts with the same code, including administrator renames. Conflicting existing
names/codes require review; they are not silently overwritten. No seed apply was run.

NEXTUDIO — all 37 seed accounts. Names and types match the seed definitions; purposes below document their
intended use. Expense categories may also serve as management-only classification tags for client-funded
work, without posting those amounts to expense.

| Code | Name | Type | Purpose |
| --- | --- | --- | --- |
| AST-CASH | Cash | Asset | Nextudio cash on hand. |
| AST-BANK | Bank | Asset | Nextudio bank balances. |
| AST-PETTY | Petty Cash | Asset | Cash reserved for small operating payments. |
| AST-PROJFUND | Project Funds / Project Cash | Asset | Non-postable parent grouping for individual project-fund ledgers. |
| AST-RECV | Client Receivables | Asset | Amounts clients owe Nextudio. |
| AST-REIMB | Reimbursable Project Expenses | Asset | Recoverable project costs advanced by Nextudio. |
| LIA-CLIENTFUNDS | Client Project Funds / Funds Held for Projects | Liability | Client money held for project spending; receipts increase it and disbursements reduce it. |
| LIA-PAYABLES | Supplier/Contractor Payables | Liability | Unpaid supplier/contractor bills; settlements reduce the amount owed. |
| LIA-PARTNER | Partner Current/Funding Accounts | Liability | Partner advances and amounts owed to partners. |
| EQ-OPENING | Opening Balance Equity | Equity | Offset for verified opening/migration balances only; not operating activity. |
| INC-FEES | Professional / Architecture Fees | Income | Earned architecture and professional-service fees. |
| INC-OTHER | Other Operating Income | Income | Other earned operating income, excluding client-held funds and partner funding. |
| EXP-CONCRETE | Concrete Works | Expense | Concrete construction costs borne by Nextudio. |
| EXP-STEEL | Steel | Expense | Steel materials and related works borne by Nextudio. |
| EXP-LABOR | Labor | Expense | Project labor costs borne by Nextudio. |
| EXP-EXCAVATION | Excavation | Expense | Excavation and earthworks costs borne by Nextudio. |
| EXP-MASONRY | Masonry | Expense | Masonry materials and works borne by Nextudio. |
| EXP-TILING | Tiling | Expense | Tiling materials and installation borne by Nextudio. |
| EXP-PAINTING | Painting | Expense | Painting materials and works borne by Nextudio. |
| EXP-CLADDING | Cladding | Expense | Cladding materials and installation borne by Nextudio. |
| EXP-WATERPROOF | Waterproofing | Expense | Waterproofing materials and works borne by Nextudio. |
| EXP-PLUMBING | Plumbing | Expense | Plumbing materials and installation borne by Nextudio. |
| EXP-ELECTRICAL | Electrical | Expense | Electrical materials and works borne by Nextudio. |
| EXP-ALUMINIUM | Aluminium | Expense | Aluminium fabrication and installation borne by Nextudio. |
| EXP-GYPSUM | Gypsum | Expense | Gypsum materials and works borne by Nextudio. |
| EXP-CARPENTRY | Carpentry | Expense | Carpentry and joinery costs borne by Nextudio. |
| EXP-PERMITS | Permits / Government Fees | Expense | Project permits and government charges borne by Nextudio. |
| EXP-TRANSPORT | Transportation / Delivery | Expense | Project transportation and delivery costs borne by Nextudio. |
| EXP-OTHERPROJECT | Other Project Costs | Expense | Other project costs borne by Nextudio that lack a dedicated category. |
| CEXP-SALARIES | Salaries | Expense | Company payroll costs. |
| CEXP-RENT | Rent | Expense | Company premises rent. |
| CEXP-SOFTWARE | Software / Subscriptions | Expense | Business software and subscription costs. |
| CEXP-PRINTING | Printing / Stationery | Expense | Printing, paper and stationery costs. |
| CEXP-OFFICE | Office Expenses | Expense | General office running costs. |
| CEXP-PROFFEES | Professional Fees | Expense | External professional services purchased by Nextudio. |
| CEXP-BANKFEES | Bank Fees | Expense | Banking and payment-processing charges. |
| CEXP-OTHEROPEX | Other Operating Expenses | Expense | Other company operating costs without a dedicated category. |

`PROJFUND-<UUID>` is not one of the 37 seed accounts. Each individual fund creates an additional, unique
asset posting account, named for that fund (for example DNT Cash, SBM Cash or Kayfoun Cash).

NEXTUDIO SARL — all 11 seed accounts, held in its separate book:

| Code | Name | Type | Purpose |
| --- | --- | --- | --- |
| AST-CASH | Cash | Asset | SARL cash on hand. |
| AST-BANK | Bank | Asset | SARL bank balances. |
| AST-RECV | Client Receivables | Asset | Amounts clients owe SARL. |
| LIA-CLIENTFUNDS | Client Project Funds / Funds Held for Projects | Liability | Client project money held by SARL, separate from its revenue. |
| LIA-PAYABLES | Supplier/Contractor Payables | Liability | Unpaid SARL supplier/contractor bills and their settlements. |
| LIA-PARTNER | Partner Current/Funding Accounts | Liability | Partner advances and amounts SARL owes partners. |
| EQ-OPENING | Opening Balance Equity | Equity | Offset for verified SARL opening/migration balances only. |
| INC-FEES | Professional / Architecture Fees | Income | Earned SARL architecture and professional-service fees. |
| INC-OTHER | Other Operating Income | Income | Other earned SARL operating income, excluding client-held funds and partner funding. |
| CEXP-BANKFEES | Bank Fees | Expense | SARL banking and payment-processing charges. |
| CEXP-OTHEROPEX | Other Operating Expenses | Expense | Other SARL operating costs within this minimal chart. |

No tax/VAT chart or historical chart import is included.

## Revised posting matrix

| Business action | Debit | Credit | Management information |
| --- | --- | --- | --- |
| Nextudio expense paid | Cost/expense or appropriate asset | Source cash/bank | Project, payee, date, purpose, reference |
| Client project funding received | Dedicated project cash | LIA-CLIENTFUNDS | Project, payer, date, source reference |
| Client-held funds disbursed | LIA-CLIENTFUNDS | Source project cash | Project, payee, expense-category classification, date, purpose, fund, reference |
| Professional fee received | Nextudio cash/bank | INC-FEES | Payer, project if applicable, date, reference |
| Transfer | Destination cash/bank | Source cash/bank | No revenue or cost; currencies must match |
| Bill incurred | Cost/expense or appropriate asset | Supplier/Contractor Payables | Project and payee retained on both journal legs; no cash moves |
| Bill partly/fully paid | Same payable liability | Source cash/bank | Money Out; project, payee and bill reference; cost is not debited again |
| Debit opening | Selected balance-sheet account | EQ-OPENING | Effective date, currency, source reference, description, project/fund, audit |
| Credit opening | EQ-OPENING | Selected balance-sheet account | Same; supports liabilities, equity and asset overdrafts |
| Correction | Original credits become debits | Original debits become credits | New linked reversal; original remains immutable and visible |

The normal Money Out form now offers payable liabilities. Client funds held uses its own disbursement tab.
Client funding into project funds is restricted server-side to `LIA-CLIENTFUNDS`; it cannot credit fee income.
Disbursement classification must be an active expense category, but it is a reporting tag, not a journal leg.
Project cost reports and client-disbursement breakdowns are separate and restricted to the selected book.
Cash movement totals still include genuine client receipts/disbursements; these totals are not P&L.

## Project-fund ledgers

Creating DNT Cash, SBM Cash or Kayfoun Cash creates a separate asset account with a persistent
`PROJFUND-<UUID>` code and audit record. Multiple funds for DNT also get different ledger accounts.
If `AST-PROJFUND` exists, it is the parent used for trial-balance grouping. Fund and ledger creation are atomic.

Database guards prevent a fund ledger being shared with another fund or a normal cash/bank account.
Ledger, kind, book, project and currency cannot be reassigned after creation; names and activation may change.
Deactivated funds retain their history and ledger. `AST-PROJFUND` cannot receive journal lines.
Both the ledger account statement and the cash-account statement independently reconcile to the fund.
Trial balance lists the fund accounts separately beneath the parent, without double-counting a parent total.

## Client-held example (illustrative only)

Client provides $2,000 for DNT:

```text
Dr DNT Cash                         2,000
    Cr Client Project Funds Held          2,000
```

DNT pays Mahmoud $500 for concrete work on the client's behalf:

```text
Dr Client Project Funds Held          500
    Cr DNT Cash                             500
```

Retained information: DNT project, Mahmoud payee, Concrete Works classification, payment date, purpose,
source DNT Cash and reference. Remaining DNT cash and liability are both $1,500. There is no expense or
professional revenue posting. If Nextudio itself incurs a cost, use the expense/bill workflow instead.

## Opening-balance architecture

`POST /api/accounting/opening-balances` is behind the accounting admin gate. It accepts:

- `book_id`, `effective_date`, balance-sheet `account_id`, positive `amount`, and `currency_code`.
- `balance_side` (`debit` or `credit`), defaulting to the account's normal side.
- `project_id` and `cash_account_id` where applicable. A fund must match its project and ledger.
- Required `reference` and `description`, with the authenticated user supplying audit attribution.

One request produces one balanced two-line journal against active equity account `EQ-OPENING`.
Income, expense, the grouping account and EQ-OPENING itself cannot be the target. The reference is unique
within the book; retries with the same reference fail without creating another entry. Shared ordinary cash
ledgers require an explicit cash account rather than picking an arbitrary first row.

Effective date, currency, `entry_kind = opening_balance`, reference, description, poster and timestamps are
persisted on the journal. Project/fund are on the target leg, and the full resolved input and equity offset
are audited in the same transaction. No human-facing cash transaction is created, so openings do not inflate
Money In/Out or project costs. Corrections use reversals, including currency and fund attribution.

EQ-OPENING is the dedicated migration offset. Future verified opening assets, liabilities and equity should
be reconciled together against the approved opening trial balance; an unexplained residual is for review,
never automatically plugged to income or expense. This change enters no actual opening amounts.

Currency is explicitly stored and validated. This phase supports the book currency only (USD for the
seeded books), and cash currency must match. Unsupported FX/exchange rates are rejected rather than mixing
unconverted amounts in ledger totals. Multi-currency valuation/conversion is a later feature.

## Required currency preservation for the future Polypus importer

The Phase 1B manual-entry UI may remain book-currency-only. That restriction must not become a lossy
historical-import rule. The upcoming Polypus historical importer must preserve legacy USD/LBP currency
information, original historical amounts and historical exchange rates, including both original-currency
and converted amounts where the source provides them. Keep their source references and rate context.

Do not normalize away, overwrite or discard legacy foreign-currency information. Do not substitute current
rates or assume a missing historical rate is 1. Any derived book-currency amounts must be recorded alongside
the preserved source data, with an explicit conversion basis. Missing or ambiguous currency/rate data must
be retained and flagged for review. The importer must not force historical entries through the current
manual-entry currency restriction by stripping or replacing their source currency or amounts.

## Protected-account enforcement before production

The final review identified two enforcement gaps; both are now fixed locally. The conceptual chart and
posting matrix are unchanged. No production migration, seed, data change, commit, push or deployment occurred.

- Every service path using LIA-CLIENTFUNDS requires a project associated with the same book: receipts,
  disbursements, non-cash account selection, openings and reversals. Control projects are global records,
  so their accounting association is defined by existing project-fund setup in that book. A global project
  ID alone, or fund setup only in another book, is insufficient. Inactive funds still establish association.
  Set up a project's fund before its first client-liability opening, receipt or historical import.
- Journal-line database triggers enforce the project/book requirement on either debit or credit and on
  inserts/updates. Transaction headers receive equivalent protection. Funds with client-liability history
  must be deactivated instead of deleted, preserving their association for later reconciliation/reversal.
- EQ-OPENING is rejected by ordinary purpose/payable account selection in the service, regardless of UI
  visibility. Transfers cannot supply purpose/contra accounts, and their cash ledgers must be assets.
  Protected opening/group accounts are excluded from normal transaction account pickers; client funds held
  is excluded from the normal Bill/Payable picker and remains available in its dedicated funding workflows.
- The database permits EQ-OPENING journal lines only on `opening_balance` entries, rejects its use on
  operating transactions, prevents ordinary transactions linking to opening journals, and prevents later
  journal-kind changes. API clients cannot select the ordinary posting's journal kind. Dedicated migration
  opening entries can use this same journal-only path; their reversals preserve the opening kind.
- Reversals copy the original project dimension exactly. They remain valid after fund/account deactivation.
  Existing malformed protected postings cause migration preflight to stop for reconciliation rather than
  rewriting history or installing guards that would strand their reversal workflow.

AST-PROJFUND remains non-postable, each fund retains its unique ledger, and payable settlement still debits
the payable instead of creating another expense. The future Polypus currency-preservation requirement above
remains mandatory; these guards introduce no historical currency normalization.

## Migrations and safeguards

- `20261015000000_accounting_non_cash_payable.sql`: contra account with same-book FK; non-cash entries
  require distinct debit/credit accounts, and other directions forbid a contra account.
- `20261016000000_accounting_fund_ledgers_and_classification.sql`: parent grouping and management
  classification, with same-book FKs, indexes and direction restrictions. This file already existed.
- `20261017000000_accounting_opening_and_fund_guards.sql`: journal currency and opening kind; database
  fund exclusivity, immutable cash mapping, grouping-post prohibition and reserved account identity/type
  guards. If an existing fund has a shared/group/non-asset ledger, migration stops for review instead of
  remapping balances or rewriting historical postings.
- `20261018000000_accounting_protected_posting_paths.sql`: protected-account preflight and triggers for
  mandatory client-funds project/book attribution, opening-only equity use, transaction/header checks,
  immutable journal kind and preservation of project-fund associations needed by reversals. No new tables,
  account seeds or balance updates. Prior migrations are unchanged by this enforcement follow-up.

Phase 1A migrations are unchanged. All 28 repository migrations were loaded only into isolated in-memory
PostgreSQL for testing. These pending changes require coordinated migration/application rollout after review.

## Validation and limits

`npm run test:accounting-local` loads the actual repository migrations into PGlite and injects one connection
into the posting engine. Tests use BEGIN/ROLLBACK; the harness checks that no fixture books/journals remain
and makes application pool queries fail closed. The HTTP integration portion temporarily redirects pool
queries to that same connection and translates route BEGIN/COMMIT/ROLLBACK into savepoints; it cannot commit
the outer test transaction. It never uses the production URL. The ordinary smoke CLI
also refuses non-local database hosts. A PGlite development dependency and test script were added.

The requested payable scenario passes: Dr Concrete Works 1,000 / Cr Payables 1,000; then Dr Payables 400 /
Cr Cash 400; liability remaining 600 and Concrete Works still 1,000. Another check proves the same balance
by supplier/project and inspects the exact payment legs. This is ledger settlement; bill-level payment
allocation, bill aging and invoice-level overpayment prevention are not implemented in Phase 1B.

Other tests cover independent cash and ledger balances, trial-balance grouping, same-project multiple funds,
database rejection paths, client-fund liability reduction and classification, book isolation, opening metadata,
P&L/FX/mapping rejection, duplicate references, debit/credit openings, audit and reversals.

Validation: 43 rollback-only smoke checks and 3 structural auth checks pass. The new checks cover missing,
nonexistent, unassociated and other-book projects; successful client-funds receipts/disbursements/non-cash
entries/openings; reversals preserving projects; direct SQL guard failures; and actual loopback HTTP
requests through the production posting/opening/reversal route handlers. Nine direct HTTP attempts to use
EQ-OPENING in ordinary transactions return 400, including attempts to spoof the opening journal kind.
The dedicated opening endpoint succeeds and its reversal preserves project and opening kind.

Server/client typechecks and builds pass. Lint for all accounting server modules and accounting scripts
passes. Client accounting lint exits successfully with existing React warnings. The previously checked full
server lint has 9 pre-existing errors in `auth.ts`, `estimates.ts`, `index.ts` and `scripts/check.ts`; those
files were not changed by this enforcement follow-up.
`git diff --check` passes.

PGlite validates SQL and service integration;
it does not validate hosted PostgreSQL concurrency or production access configuration. Structural auth tests
verify route registration and employee allowlisting, rather than a live login session. The HTTP posting
tests use a synthetic admin fixture and do not exercise real login/session creation.
