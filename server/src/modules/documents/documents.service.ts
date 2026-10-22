import { HttpError } from '../../shared'
import { labelsFor } from '../../shared/i18n/documentLabels'
import { loadEstimate } from '../estimates/estimates.service'
import { loadInvoice } from '../invoices/invoices.service'
import { loadReceipt } from '../receipts/receipts.service'
import { loadLetter } from '../letters/letters.service'
import { signerSignatureDataUri } from '../signatures-and-stamps/document-signers.service'
import { stampDataUri } from '../signatures-and-stamps/organization-stamps.service'
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

export async function quotationDocument(organizationId: string, estimateId: string): Promise<DocumentData> {
  const estimate = await loadEstimate(organizationId, estimateId)
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

export async function invoiceDocument(organizationId: string, invoiceId: string): Promise<DocumentData> {
  const invoice = await loadInvoice(organizationId, invoiceId)
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
    // A cancelled payment no longer counts - don't print it on a document the client sees
    payments: invoice.payments.filter((payment: { cancelled_at: string | null }) => !payment.cancelled_at),
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

export async function receiptDocument(organizationId: string, receiptId: string): Promise<DocumentData> {
  const receipt = await loadReceipt(organizationId, receiptId)
  if (!receipt) throw new HttpError(404, 'Receipt not found')
  const t = labelsFor(receipt.document_language)

  // Looked up by signer id, not by the snapshotted name text - a legacy receipt with no signer_id (the
  // two that predate this feature) simply gets no signature image, same as before this feature existed.
  const [adminSignatureDataUri, receiverSignatureDataUri, paidStampDataUri, companyStampDataUri] = await Promise.all([
    receipt.issued_by_signer_id ? signerSignatureDataUri(organizationId, receipt.issued_by_signer_id) : Promise.resolve(null),
    receipt.received_by_signer_id ? signerSignatureDataUri(organizationId, receipt.received_by_signer_id) : Promise.resolve(null),
    receipt.show_paid_stamp ? stampDataUri(organizationId, 'paid_stamp') : Promise.resolve(null),
    receipt.show_company_stamp ? stampDataUri(organizationId, 'company_stamp') : Promise.resolve(null),
  ])

  return {
    kind: 'receipt',
    language: receipt.document_language,
    heading: t.receipt,
    subtitle: t.receiptSubtitle,
    number: receipt.receipt_number,
    numberLabel: t.receiptNumber,
    dateLabel: t.receiptDate,
    date: receipt.receipt_date,
    secondDateLabel: '',
    secondDate: null,
    currency: receipt.currency,
    billTo: { name: receipt.receiver_name, contact: null, phone: null, email: receipt.receiver_email, address: null },
    projectLocation: null,
    introduction: null,
    items: [],
    pricingMethod: 'itemized',
    subtotal: receipt.amount,
    discount: '0',
    discountType: 'fixed',
    discountValue: '0',
    total: receipt.amount,
    sections: [],
    payments: [],
    amountDue: null,
    contract: null,
    reason: receipt.reason,
    // "Received By" is the admin who received the money, never the client's name (receiver_name is
    // already shown above, under "Received From")
    signOff: {
      adminName: receipt.issued_by_admin,
      receiverName: receipt.received_by_admin ?? '',
      adminSignatureDataUri,
      receiverSignatureDataUri,
    },
    paidStampDataUri,
    companyStampDataUri,
    cancelled: Boolean(receipt.cancelled_at),
  }
}

export async function letterDocument(organizationId: string, letterId: string): Promise<DocumentData> {
  const letter = await loadLetter(organizationId, letterId)
  if (!letter) throw new HttpError(404, 'Letter not found')
  const t = labelsFor(letter.document_language)
  return {
    kind: 'letter',
    language: letter.document_language,
    heading: t.letter,
    // The admin's own subject line, shown where a quotation shows its summary/title - not a fixed label.
    subtitle: letter.subject,
    number: letter.letter_number,
    numberLabel: t.letterNumber,
    dateLabel: t.letterDate,
    date: letter.letter_date,
    secondDateLabel: '',
    secondDate: null,
    currency: 'USD',
    billTo: { name: letter.recipient_name, contact: null, phone: null, email: null, address: null },
    projectLocation: null,
    introduction: null,
    items: [],
    pricingMethod: 'itemized',
    subtotal: '0',
    discount: '0',
    discountType: 'fixed',
    discountValue: '0',
    total: '0',
    sections: [],
    payments: [],
    amountDue: null,
    contract: null,
    body: letter.body,
    adminSignOff: letter.issued_by_admin,
  }
}
