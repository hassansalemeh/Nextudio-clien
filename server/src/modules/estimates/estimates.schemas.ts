import { z } from 'zod'
import { DOCUMENT_LANGUAGES } from '../../shared/i18n/documentLabels'
import { idString, isoDate, optionalIdString, optionalIsoDate, optionalLongText, optionalText, roundMoney, text } from '../../shared'

export const ESTIMATE_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const
export const UNITS = ['sqm', 'lm', 'ls', 'pc', 'm3', 'sheet'] as const
export const PRICING_METHODS = ['itemized', 'lump_sum'] as const
const DISCOUNT_TYPES = ['fixed', 'percent'] as const
const MAX_ITEMS = 200

export const estimateIdParams = z.object({ estimateId: idString('Estimate id') })

export const reuseTextQuery = z.object({
  field: optionalText('field', { max: 100 }),
  q: optionalText('q', { max: 500 }),
})

// name is required no matter the pricing method; quantity/unit/unit_price are only meaningfully checked for
// Itemized pricing (Lump Sum tolerates missing/invalid values with harmless defaults) - that mode-dependent
// leniency is a real business rule, so it stays in estimates.service's own finalizeItems, not here. These
// three are only type-widened to `unknown` so they pass through untouched for that logic to see, instead of
// being silently stripped as "unknown fields".
const estimateItemSchema = z.object({
  name: text('Item name', { max: 300 }),
  description: z.unknown().optional(),
  quantity: z.unknown().optional(),
  unit: z.unknown().optional(),
  unit_price: z.unknown().optional(),
})

export const estimateItemsField = z.array(estimateItemSchema).max(MAX_ITEMS, `An estimate can have at most ${MAX_ITEMS} items`).optional().default([])

// estimate_number is optional here: a POST with none asks the caller for an auto-generated one (see
// estimates.routes), so "estimate_number is required" for that case is enforced where the auto-number
// decision is made, not in this shared shape. PUT (update) requires one explicitly - see updateEstimateBody.
export const estimateHeaderBody = z
  .object({
    estimate_number: optionalText('Estimate number', { max: 100 }),
    title: optionalText('Title', { max: 300 }).transform((value) => value ?? 'Quotation'),
    summary: optionalLongText('Summary'),
    client_id: optionalIdString('client_id'),
    contact_name: optionalText('Contact name', { max: 300 }),
    customer_ref: optionalText('Customer reference', { max: 300 }),
    estimate_date: isoDate('Estimate date'),
    valid_until: optionalIsoDate('Valid until'),
    currency: z
      .string({ error: 'Currency must be a 3-letter code such as USD' })
      .trim()
      .transform((value) => value.toUpperCase())
      .optional()
      .default('USD')
      .refine((value) => /^[A-Z]{3}$/.test(value), { message: 'Currency must be a 3-letter code such as USD' }),
    status: z.enum(ESTIMATE_STATUSES, { error: `Status must be one of: ${ESTIMATE_STATUSES.join(', ')}` }).optional().default('draft'),
    notes: optionalLongText('Notes'),
    payment_terms: optionalLongText('Payment terms'),
    timeline: optionalLongText('Timeline'),
    exclusions: optionalLongText('Exclusions'),
    discount_type: z.enum(DISCOUNT_TYPES, { error: 'Discount type must be fixed or percent' }).optional().default('fixed'),
    discount_value: z.number({ error: 'Discount must be 0 or more' }).finite().min(0, 'Discount must be 0 or more').optional().default(0),
    pricing_method: z.enum(PRICING_METHODS, { error: 'Pricing method must be itemized or lump_sum' }).optional().default('itemized'),
    lump_sum_fee: z
      .number({ error: 'Lump sum fee must be 0 or more' })
      .finite()
      .min(0, 'Lump sum fee must be 0 or more')
      .optional()
      .default(0)
      .transform(roundMoney),
    document_language: z.enum(DOCUMENT_LANGUAGES, { error: `Document language must be one of: ${DOCUMENT_LANGUAGES.join(', ')}` }).optional().default('en'),
    project_id: optionalIdString('project_id'),
    project_location: optionalText('Project location', { max: 500 }),
    introduction: optionalLongText('Introduction'),
    items: estimateItemsField,
  })
  .superRefine((data, ctx) => {
    if (data.valid_until !== null && data.valid_until < data.estimate_date) {
      ctx.addIssue({ code: 'custom', message: 'Valid until cannot be before the estimate date', path: ['valid_until'] })
    }
  })

export const createEstimateBody = estimateHeaderBody

export const updateEstimateBody = estimateHeaderBody.refine((data) => data.estimate_number !== null, {
  message: 'Estimate number is required',
  path: ['estimate_number'],
})
