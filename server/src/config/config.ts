// Standard number of working hours in a month. The single place this value is defined:
// hourly labor cost = monthly_salary / STANDARD_MONTHLY_HOURS.
// Override with the STANDARD_MONTHLY_HOURS environment variable (server/.env).
// Changing it only affects work started afterwards: each time entry stores the hourly rate it was recorded with.
export const STANDARD_MONTHLY_HOURS = Number(process.env.STANDARD_MONTHLY_HOURS) || 176

export function hourlyRateFromSalary(monthlySalary: number): number {
  return Math.round((monthlySalary / STANDARD_MONTHLY_HOURS) * 10000) / 10000
}

// Invoices created from approved estimates are numbered NEX-INV-0001, NEX-INV-0002, ...
// (a different format from the older Wave invoices, NEX_INV_153, so the two never clash)
export const INVOICE_PREFIX = 'NEX-INV-'
export const INVOICE_PAYMENT_TERM_DAYS = 7

// Client Funds invoices (money held for project expenses, not a design fee) have their own series,
// NEX-CF-0001, NEX-CF-0002, ..., so they can never collide with or be confused for a professional invoice
export const CLIENT_FUNDS_INVOICE_PREFIX = 'NEX-CF-'

// Estimates are numbered NEX-QUO-0197, NEX-QUO-0198, ... continuing after the highest number already used.
// The number is only a suggestion: it can be edited before saving.
export const ESTIMATE_PREFIX = 'NEX-QUO-'

export function invoiceNumber(sequence: number): string {
  return INVOICE_PREFIX + String(sequence).padStart(4, '0')
}

export function clientFundsInvoiceNumber(sequence: number): string {
  return CLIENT_FUNDS_INVOICE_PREFIX + String(sequence).padStart(4, '0')
}

// Receipts are numbered NEX-REC-0001, NEX-REC-0002, ..., their own series.
export const RECEIPT_PREFIX = 'NEX-REC-'

// Letters are numbered NEX-LTR-0001, NEX-LTR-0002, ..., their own series.
export const LETTER_PREFIX = 'NEX-LTR-'

// The only two people allowed to sign a receipt or a letter as the issuing admin. A fixed list (not a
// DB check constraint) so adding a third name later is a one-line change here, not a migration.
export const ADMIN_SIGNERS = ['Mohamad Omar', 'Mohamad Ramadan']

// WhatsApp numbers for the same two admins, used to build a wa.me link when an employee requests a day
// off. International format, digits only (no "+", spaces or dashes). Optional - an admin with no number
// configured is simply left out of the links offered to the employee. Set via ADMIN_WHATSAPP_OMAR /
// ADMIN_WHATSAPP_RAMADAN (server/.env) rather than hard-coding a phone number here.
export const ADMIN_WHATSAPP_NUMBERS: Record<string, string | undefined> = {
  'Mohamad Omar': process.env.ADMIN_WHATSAPP_OMAR,
  'Mohamad Ramadan': process.env.ADMIN_WHATSAPP_RAMADAN,
}
