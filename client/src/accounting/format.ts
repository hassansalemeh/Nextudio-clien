// Small shared helpers for the accounting pages - kept local to this module rather than added to the
// main app's shared files, since Accounting is meant to be a self-contained workspace.

export const API_URL = import.meta.env.VITE_API_URL ?? ''

export function money(amount: number | string, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))
}

export const DIRECTION_LABELS: Record<string, string> = {
  money_in: 'Money In',
  money_out: 'Money Out',
  transfer: 'Transfer',
  non_cash: 'Bill / Payable',
}

export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  approved: 'Approved',
  posted: 'Posted',
  reversed: 'Reversed',
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expense',
}

export const CASH_ACCOUNT_KIND_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank',
  card: 'Card',
  petty_cash: 'Petty Cash',
  project_fund: 'Project Fund',
}

export const COUNTERPARTY_KIND_LABELS: Record<string, string> = {
  worker: 'Worker',
  contractor: 'Contractor',
  supplier: 'Supplier',
  consultant: 'Consultant',
  employee: 'Employee',
  client: 'Client',
  government: 'Government',
  other: 'Other',
}

export async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(`${API_URL}${url}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Something went wrong')
  }
  return response.json()
}
