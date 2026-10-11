// The only two people allowed to sign a receipt as the issuing admin - mirrors
// server/src/config/config.ts's RECEIPT_ADMIN_SIGNERS.
export const ADMIN_SIGNERS = ['Mohamad Omar', 'Mohamad Ramadan']

// The receipt PDF's language; the admin app itself stays English
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
