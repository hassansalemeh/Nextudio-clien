// Mirrors the enum lists in server/src/accounting/types.ts - the client can't import server code directly,
// and these values are simple/stable enough that duplicating them here is clearer than fetching them.

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const
export const CASH_ACCOUNT_KINDS = ['cash', 'bank', 'card', 'petty_cash', 'project_fund'] as const
export const COUNTERPARTY_KINDS = ['worker', 'contractor', 'supplier', 'consultant', 'employee', 'client', 'government', 'partner', 'other'] as const
