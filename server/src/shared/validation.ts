import { z } from 'zod'
import { isIsoDate } from './http'

// Same permissive pattern every module already used by hand (kept, not replaced, so no address that used to
// pass now fails): something@something.something, no whitespace either side of the @.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Control characters (below 0x20, plus DEL) are rejected outright - not stripped, rejected - because a
// control character has no legitimate reason to be typed into any of these fields, and rejecting instead of
// silently dropping it tells the caller something is wrong instead of quietly altering their data. Tab (0x09),
// newline (0x0A) and carriage return (0x0D) are the only ones ever legitimate, and only inside a multi-line
// field (a textarea), never in a single-line one (a name, an email, a title).
function hasDisallowedControlChars(value: string, allowNewlines: boolean): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      if (!allowNewlines) return true
      continue
    }
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

// A single-line piece of text: trimmed, required, a maximum length, and no control characters. This never
// touches ordinary punctuation - < > ' " & are left exactly as typed. SQL injection is already prevented by
// parameterized queries ($1, $2...) and XSS by escaping at output (React, and escapeHtml in the PDF layout),
// so there is nothing to gain from mangling those characters here, and real data (a client's name with an
// ampersand, a quoted phrase, a comparison written with < or >) would be corrupted by stripping them - and an
// attacker who actually wanted to break the page could still work around a naive filter anyway.
export function text(label: string, { max = 255, min = 1 }: { max?: number; min?: number } = {}) {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`)
    .refine((value) => !hasDisallowedControlChars(value, false), { message: `${label} contains characters that are not allowed` })
}

export function optionalText(label: string, { max = 255 }: { max?: number } = {}) {
  return z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .refine((value) => !hasDisallowedControlChars(value, false), { message: `${label} contains characters that are not allowed` })
    .transform((value) => value || null)
    .nullable()
    .optional()
    .default(null)
}

// A multi-line piece of text (a textarea): same rules, but newlines/tabs are allowed since they're how the
// text was actually typed.
export function multilineText(label: string, { max = 10000, min = 0 }: { max?: number; min?: number } = {}) {
  return z
    .string({ error: `${label} must be text` })
    .max(max, `${label} must be ${max} characters or fewer`)
    .refine((value) => !hasDisallowedControlChars(value, true), { message: `${label} contains characters that are not allowed` })
    .refine((value) => value.trim().length >= min, { message: `${label} is required` })
}

export function optionalMultilineText(label: string, { max = 10000 }: { max?: number } = {}) {
  return z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .refine((value) => !hasDisallowedControlChars(value, true), { message: `${label} contains characters that are not allowed` })
    .transform((value) => value || null)
    .nullable()
    .optional()
    .default(null)
}

// A long free-text section (quotation/invoice notes, terms, timeline...) that keeps its line breaks exactly
// as typed - unlike optionalText, this never trims the value - only a whitespace-only string becomes null.
export function optionalLongText(label: string, { max = 20000 }: { max?: number } = {}) {
  return z
    .string({ error: `${label} must be text` })
    .max(max, `${label} must be ${max} characters or fewer`)
    .refine((value) => !hasDisallowedControlChars(value, true), { message: `${label} contains characters that are not allowed` })
    .transform((value) => (value.trim() ? value : null))
    .nullable()
    .optional()
    .default(null)
}

export function email(label = 'Email address') {
  return z
    .string({ error: `Enter a valid email address` })
    .trim()
    .max(254, `${label} must be 254 characters or fewer`)
    .regex(EMAIL_RE, `Enter a valid email address`)
}

export function optionalEmail(label = 'Email address') {
  return z
    .string({ error: `Enter a valid email address` })
    .trim()
    .max(254, `${label} must be 254 characters or fewer`)
    .refine((value) => value === '' || EMAIL_RE.test(value), { message: `Enter a valid email address` })
    .transform((value) => value || null)
    .nullable()
    .optional()
    .default(null)
}

// A single address, or several separated by commas - the same shape the email-sending routes have always
// accepted, kept as one reusable piece since estimate/invoice/letter/receipt emails all take it identically.
export function emailList(label: string, { required }: { required: boolean }) {
  const base = z
    .string({ error: `${label} is required` })
    .transform((value) => value.trim())
    .superRefine((value, ctx) => {
      if (!value) {
        if (required) ctx.addIssue({ code: 'custom', message: `${label} is required` })
        return
      }
      for (const address of value.split(',').map((a) => a.trim()).filter(Boolean)) {
        if (!EMAIL_RE.test(address)) ctx.addIssue({ code: 'custom', message: `"${address}" is not a valid email address` })
      }
    })
    .transform((value) => {
      const addresses = value.split(',').map((a) => a.trim()).filter(Boolean)
      return addresses.length ? addresses.join(', ') : null
    })
  return required ? base : base.optional().default(null)
}

// A path/body id: the database's bigint primary keys, always sent over HTTP as decimal-digit strings. Kept as
// a string (not coerced to a number) since every repository already takes ids as strings for its $1/$2... params.
export function idString(label = 'id') {
  return z
    .string({ error: `${label} must be a positive whole number` })
    .regex(/^\d+$/, `${label} must be a positive whole number`)
    .refine((value) => value !== '0', { message: `${label} must be a positive whole number` })
}

export function optionalIdString(label = 'id') {
  return z.union([z.null(), idString(label)]).optional().default(null)
}

export function isoDate(label = 'date') {
  return z.string({ error: `${label} is required` }).refine(isIsoDate, { message: `${label} must be a valid date (YYYY-MM-DD)` })
}

export function optionalIsoDate(label = 'date') {
  return z.union([z.null(), isoDate(label)]).optional().default(null)
}

// A full timestamp (e.g. new Date().toISOString(), or anything else Date can parse) - distinct from isoDate's
// plain YYYY-MM-DD, for the few places (time tracking) that work with a precise moment, not just a calendar day.
export function isoDateTime(label = 'date/time') {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => !Number.isNaN(Date.parse(value)), { message: `${label} is not a valid date/time` })
}

export function optionalIsoDateTime(label = 'date/time') {
  return z.union([z.null(), isoDateTime(label)]).optional().default(null)
}

// Money: never negative, always finite - matches roundMoney's own expectations downstream.
export function money(label = 'amount', { min = 0 }: { min?: number } = {}) {
  return z
    .number({ error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .min(min, min === 0 ? `${label} cannot be negative` : `${label} must be at least ${min}`)
}

export function optionalMoney(label = 'amount', { min = 0 }: { min?: number } = {}) {
  return z.union([z.null(), money(label, { min })]).optional().default(null)
}

export function positiveInt(label = 'value') {
  return z.number({ error: `${label} must be a whole number` }).int(`${label} must be a whole number`).positive(`${label} must be greater than 0`)
}
