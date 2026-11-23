import { z } from 'zod'
import { DOCUMENT_LANGUAGES } from '../../shared/i18n/documentLabels'
import { idString, isoDate, optionalIdString, optionalIsoDate, optionalLongText, optionalText, text } from '../../shared'
import { UNITS } from '../estimates/estimates.schemas'

const DISCOUNT_TYPES = ['fixed', 'percent'] as const
const MAX_ITEMS = 200

export const invoiceIdParams = z.object({ invoiceId: idString('Invoice id') })

export const nextInvoiceNumberQuery = z.object({
  type: z.literal('client_funds', { error: 'Unsupported invoice type' }),
})

// Client Funds invoice items are always strict (there is no Lump Sum mode here, unlike estimates).
const invoiceItemSchema = z.object({
  name: text('Item description', { max: 300 }),
  description: optionalLongText('Item description', { max: 5000 }),
  quantity: z.number({ error: 'quantity must be a number' }).finite().positive('quantity must be greater than 0'),
  unit: z.enum(UNITS, { error: `unit must be one of ${UNITS.join(', ')}` }),
  unit_price: z.number({ error: 'unit price must be a number' }).finite().min(0, 'unit price must be 0 or more'),
})

const invoiceItemsField = z.array(invoiceItemSchema).max(MAX_ITEMS, `An invoice can have at most ${MAX_ITEMS} items`).optional().default([])

// invoice_number is optional here: a POST with none asks the caller for an auto-generated one (see
// invoices.routes), so "required" for that case is enforced where the auto-number decision is made.
// PUT (update) requires one explicitly - see updateClientFundsInvoiceBody.
const clientFundsHeaderShape = z
  .object({
    invoice_type: z.literal('client_funds', {
      error: 'Only a Client Funds invoice can be created directly; approve an estimate for a Professional Services invoice',
    }),
    invoice_number: optionalText('Invoice number', { max: 100 }),
    client_id: idString('client_id'),
    project_id: idString('project_id'),
    contact_name: optionalText('Contact name', { max: 300 }),
    customer_ref: optionalText('Customer reference', { max: 300 }),
    title: optionalText('Title', { max: 300 }).transform((value) => value ?? 'Client Funds / Project Expenses'),
    summary: optionalLongText('Summary'),
    invoice_date: isoDate('Invoice date'),
    due_date: optionalIsoDate('Payment due date'),
    currency: z
      .string({ error: 'Currency must be a 3-letter code such as USD' })
      .trim()
      .transform((value) => value.toUpperCase())
      .optional()
      .default('USD')
      .refine((value) => /^[A-Z]{3}$/.test(value), { message: 'Currency must be a 3-letter code such as USD' }),
    notes: optionalLongText('Notes'),
    payment_terms: optionalLongText('Payment terms'),
    timeline: optionalLongText('Timeline'),
    exclusions: optionalLongText('Exclusions'),
    discount_type: z.enum(DISCOUNT_TYPES, { error: 'Discount type must be fixed or percent' }).optional().default('fixed'),
    discount_value: z.number({ error: 'Discount must be 0 or more' }).finite().min(0, 'Discount must be 0 or more').optional().default(0),
    document_language: z.enum(DOCUMENT_LANGUAGES, { error: `Document language must be one of: ${DOCUMENT_LANGUAGES.join(', ')}` }).optional().default('en'),
    project_location: optionalText('Project location', { max: 500 }),
    introduction: optionalLongText('Introduction'),
    items: invoiceItemsField,
  })

export const createClientFundsInvoiceBody = clientFundsHeaderShape

export const updateClientFundsInvoiceBody = clientFundsHeaderShape.refine((data) => data.invoice_number !== null, {
  message: 'Invoice number is required',
  path: ['invoice_number'],
})

export const updateInvoiceContractBody = z.object({
  contract_terms: optionalLongText('Contract terms'),
  client_representative_name: optionalText('Client representative name', { max: 300 }),
  client_representative_title: optionalText('Client representative title', { max: 300 }),
  nextudio_representative_name: optionalText('Nextudio representative name', { max: 300 }),
  nextudio_representative_title: optionalText('Nextudio representative title', { max: 300 }),
})
