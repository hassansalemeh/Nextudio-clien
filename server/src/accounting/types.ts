// Shared types for the accounting domain. Kept separate from the rest of the app's money tables
// (payments, invoices, invoice_disbursements) - this is a self-contained double-entry ledger.

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export const CASH_ACCOUNT_KINDS = ['cash', 'bank', 'card', 'petty_cash', 'project_fund'] as const
export type CashAccountKind = (typeof CASH_ACCOUNT_KINDS)[number]

export const COUNTERPARTY_KINDS = ['worker', 'contractor', 'supplier', 'consultant', 'employee', 'client', 'government', 'other'] as const
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
  created_by_user_id: string
}

export type AuditAction = 'create' | 'update' | 'post' | 'reverse' | 'deactivate' | 'reactivate' | 'delete'
export type AuditEntityType = 'transaction' | 'journal_entry' | 'account' | 'cash_account' | 'counterparty' | 'book'
