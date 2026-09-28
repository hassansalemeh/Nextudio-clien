// Shared types for the accounting domain. Kept separate from the rest of the app's money tables
// (payments, invoices, invoice_disbursements) - this is a self-contained double-entry ledger.

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const CASH_ACCOUNT_KINDS = ['cash', 'bank', 'card', 'petty_cash', 'project_fund'] as const
export type CashAccountKind = (typeof CASH_ACCOUNT_KINDS)[number]

export const COUNTERPARTY_KINDS = ['worker', 'contractor', 'supplier', 'consultant', 'employee', 'client', 'government', 'partner', 'other'] as const
export type CounterpartyKind = (typeof COUNTERPARTY_KINDS)[number]

export const TRANSACTION_DIRECTIONS = ['money_in', 'money_out', 'transfer', 'non_cash'] as const
export type TransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number]

export const TRANSACTION_STATUSES = ['draft', 'approved', 'posted', 'reversed'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export const JOURNAL_ENTRY_STATUSES = ['draft', 'posted', 'reversed'] as const
export type JournalEntryStatus = (typeof JOURNAL_ENTRY_STATUSES)[number]

// What a normal admin fills in on Add Transaction. The posting service turns this into a balanced journal
// entry; nobody outside the posting service ever picks debit/credit directly.
export type PostTransactionInput = {
  book_id: string
  direction: TransactionDirection
  transaction_date: string
  amount: number
  currency_code: string
  exchange_rate: number | null
  description: string | null
  reference: string | null
  project_id: string | null
  counterparty_id: string | null
  category_account_id: string | null
  from_cash_account_id: string | null
  to_cash_account_id: string | null
  // Only used for direction = 'non_cash': the credit side of an entry with no cash movement, e.g. incurring a
  // supplier payable (Dr category_account_id "Project Cost" / Cr contra_account_id "Supplier Payable"). Settling
  // that payable later needs none of this - it is an ordinary money_out whose category account is the liability.
  contra_account_id: string | null
  // Only meaningful for money_out/money_in: a reporting TAG (e.g. "Concrete Works"), never posted as a journal
  // line. Exists for disbursing money already held for a client/project - category_account_id there is the real
  // liability account being reduced, and this field lets the disbursement still carry a cost classification for
  // management reporting without falsely implying that classification account was the one actually debited.
  classification_account_id: string | null
  created_by_user_id: string
}

// A journal-only entry (no accounting_transactions row - it isn't a "Paid To/Paid From" event) that sets an
// account's starting balance against Opening Balance Equity. See postingService.ts's postOpeningBalance.
export type OpeningBalanceInput = {
  book_id: string
  effective_date: string
  account_id: string
  amount: number
  currency_code: string
  project_id: string | null
  cash_account_id: string | null
  balance_side: 'debit' | 'credit' | null
  reference: string | null
  description: string | null
  created_by_user_id: string
}

export type AuditAction = 'create' | 'update' | 'post' | 'reverse' | 'deactivate' | 'reactivate' | 'delete'
export type AuditEntityType = 'transaction' | 'journal_entry' | 'account' | 'cash_account' | 'counterparty' | 'book'
