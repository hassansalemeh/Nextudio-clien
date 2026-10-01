export const UNIT_LABELS: Record<string, string> = { sqm: 'sqm', lm: 'lm', ls: 'ls', pc: 'pc', m3: 'm³', sheet: 'sheet' }

export const METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

export const METHOD_LABELS: Record<string, string> = Object.fromEntries(METHODS.map((m) => [m.value, m.label]))

export const DISBURSEMENT_CATEGORY_SUGGESTIONS = ['Construction advance', 'Contractor payment', 'Material purchase', 'Supplier payment', 'Site expense']

export const CLIENT_FUNDS_UNITS = [
  { value: 'sqm', label: 'sqm' },
  { value: 'lm', label: 'lm' },
  { value: 'ls', label: 'ls' },
  { value: 'pc', label: 'pc' },
  { value: 'm3', label: 'm³' },
  { value: 'sheet', label: 'sheet' },
]

export const CLIENT_FUNDS_CURRENCIES = [
  { value: 'USD', label: 'USD ($) - United States dollar' },
  { value: 'EUR', label: 'EUR (€) - Euro' },
  { value: 'GBP', label: 'GBP (£) - British pound' },
  { value: 'LBP', label: 'LBP - Lebanese pound' },
]

export const CLIENT_FUNDS_TERMS_SECTIONS: { field: 'payment_terms' | 'timeline' | 'notes' | 'exclusions'; label: string; placeholder: string; tall?: boolean }[] = [
  { field: 'payment_terms', label: 'Payment Terms', placeholder: 'e.g. Funds are held for project expenses and disbursed as needed...' },
  { field: 'timeline', label: 'Timeline', placeholder: 'e.g. Expected disbursement schedule...' },
  { field: 'notes', label: 'Notes', placeholder: 'General notes for the client...' },
  { field: 'exclusions', label: 'Exclusions', placeholder: 'What is not covered by these funds...', tall: true },
]
