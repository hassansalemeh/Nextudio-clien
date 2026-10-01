export const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export const UNITS = [
  { value: 'sqm', label: 'sqm' },
  { value: 'lm', label: 'lm' },
  { value: 'ls', label: 'ls' },
  { value: 'pc', label: 'pc' },
  { value: 'm3', label: 'm³' },
  { value: 'sheet', label: 'sheet' },
]

export const PRICING_METHODS = [
  { value: 'itemized', label: 'Itemized' },
  { value: 'lump_sum', label: 'Lump Sum' },
]

// The client-facing Quotation/Invoice PDF's language; the admin app itself stays English
export const DOCUMENT_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
]

export const CURRENCIES = [
  { value: 'USD', label: 'USD ($) - United States dollar' },
  { value: 'EUR', label: 'EUR (€) - Euro' },
  { value: 'GBP', label: 'GBP (£) - British pound' },
  { value: 'LBP', label: 'LBP - Lebanese pound' },
]

export const ESTIMATE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

// The four sections printed under the services table, in this order
export const TERMS_SECTIONS: { field: 'payment_terms' | 'timeline' | 'notes' | 'exclusions'; label: string; placeholder: string; tall?: boolean }[] = [
  { field: 'payment_terms', label: 'Payment Terms', placeholder: 'e.g. 1- 35% upon signing the agreement...' },
  { field: 'timeline', label: 'Timeline', placeholder: 'e.g. Phase 1 - Concept Design | 3-4 weeks...' },
  { field: 'notes', label: 'Notes', placeholder: 'General notes for the client...' },
  { field: 'exclusions', label: 'Exclusions', placeholder: 'What is not included in this quotation...', tall: true },
]
