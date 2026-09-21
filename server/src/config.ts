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

// Estimates are numbered NEX-QUO-0197, NEX-QUO-0198, ... continuing after the highest number already used.
// The number is only a suggestion: it can be edited before saving.
export const ESTIMATE_PREFIX = 'NEX-QUO-'

export function invoiceNumber(sequence: number): string {
  return INVOICE_PREFIX + String(sequence).padStart(4, '0')
}
