import { HttpError } from '../../shared'
import { labelsFor } from '../../shared/i18n/documentLabels'
import { loadEstimate } from '../estimates/estimates.service'
import { loadInvoice } from '../invoices/invoices.service'
import { DocumentData } from './documents.layout'

export { renderPdf, checkPdfEngine } from './documents.pdf'

// ---- Data -> document ----

// The four terms sections, in the order they are printed; empty ones are left out. Only the section
// titles are translated by Document Language - the text itself is the admin's own writing.
function sectionsOf(source: { payment_terms: string | null; timeline: string | null; notes: string | null; exclusions: string | null }) {
  return (
    [
      { key: 'paymentTerms', text: source.payment_terms },
      { key: 'timeline', text: source.timeline },
      { key: 'notes', text: source.notes },
      { key: 'exclusions', text: source.exclusions },
    ] as const
  ).filter((section): section is { key: typeof section.key; text: string } => !!section.text && section.text.trim() !== '')
}

export async function quotationDocument(estimateId: string): Promise<DocumentData> {
  const estimate = await loadEstimate(estimateId)
  if (!estimate) throw new HttpError(404, 'Estimate not found')
  const t = labelsFor(estimate.document_language)
  return {
    kind: 'quotation',
    language: estimate.document_language,
    heading: t.quotation,
    subtitle: estimate.summary || estimate.title,
    number: estimate.estimate_number,
    numberLabel: t.estimateNumber,
    dateLabel: t.estimateDate,
    date: estimate.estimate_date,
    secondDateLabel: t.validUntil,
    secondDate: estimate.valid_until,
    currency: estimate.currency,
    // The estimate's own frozen snapshot - never a fresh Client master record lookup
    billTo: {
      name: estimate.client_name || '',
      contact: estimate.contact_name,
      phone: estimate.client_phone,
      email: estimate.client_email,
      address: estimate.client_address,
    },
    projectLocation: estimate.project_location,
    introduction: estimate.introduction,
    items: estimate.items,
    pricingMethod: estimate.pricing_method,
    subtotal: estimate.subtotal,
    discount: estimate.discount,
    discountType: estimate.discount_type,
    discountValue: estimate.discount_value,
    total: estimate.total,
    sections: sectionsOf(estimate),
    payments: [],
    amountDue: null,
    // The Acceptance & Signatures contract only ever applies to a Professional Services Invoice
    contract: null,
  }
}

export async function invoiceDocument(invoiceId: string): Promise<DocumentData> {
  const invoice = await loadInvoice(invoiceId)
  if (!invoice) throw new HttpError(404, 'Invoice not found')
  const isClientFunds = invoice.invoice_type === 'client_funds'
  const t = labelsFor(invoice.document_language)
  return {
    kind: 'invoice',
    invoiceType: invoice.invoice_type,
    language: invoice.document_language,
    heading: isClientFunds ? t.clientFunds : t.invoice,
    subtitle: isClientFunds ? t.clientFundsSubtitle : invoice.summary || invoice.title,
    number: invoice.invoice_number,
    numberLabel: t.invoiceNumber,
    dateLabel: t.invoiceDate,
    date: invoice.invoice_date,
    secondDateLabel: t.paymentDue,
    secondDate: invoice.due_date,
    currency: invoice.currency,
    billTo: { name: invoice.client_name, contact: invoice.contact_name, phone: invoice.client_phone, email: invoice.client_email, address: invoice.client_address },
    projectLocation: invoice.project_location,
    introduction: invoice.introduction,
    items: invoice.items,
    pricingMethod: invoice.pricing_method,
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    discountType: invoice.discount_type,
    discountValue: invoice.discount_value,
    total: invoice.total,
    sections: sectionsOf(invoice),
    payments: invoice.payments,
    amountDue: invoice.amount_due,
    contract: isClientFunds
      ? null
      : {
          terms: invoice.contract_terms,
          clientRepName: invoice.client_representative_name,
          clientRepTitle: invoice.client_representative_title,
          nextudioRepName: invoice.nextudio_representative_name,
          nextudioRepTitle: invoice.nextudio_representative_title,
        },
  }
}
