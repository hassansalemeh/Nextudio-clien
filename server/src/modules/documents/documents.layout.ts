import fs from 'fs'
import path from 'path'
import { DIRECTION, DocumentLanguage, labelsFor } from '../../shared/i18n/documentLabels'

// The Nextudio logo, embedded so it prints on every page of the PDF
const LOGO_DATA_URI = `data:image/webp;base64,${fs.readFileSync(path.resolve(__dirname, '../../../assets/nextudio-logo.webp')).toString('base64')}`

// ---- Company details printed on every page (from Nextudio's existing quotations and invoices) ----
// The company's own name/address are never translated - a company name/address isn't the kind of
// "fixed label" the Document Language controls, any more than the admin's own written text is.
const COMPANY = {
  name: 'Nextudio.co',
  addressLines: ['Hazmieh | Said Freiha str.', 'Ferekh Bldg. | First floor', 'Beirut, Beyrouth', 'Lebanon'],
  phone: '+961 5 453306',
  mobile: '+ 961 3 898 658 | +961 3 077605 | +961 70 653 987',
  website: 'www.nextudio.co',
}

const UNIT_LABELS: Record<string, string> = { sqm: 'sqm', lm: 'lm', ls: 'ls', pc: 'pc', m3: 'm³', sheet: 'sheet' }

// The Arabic-capable font family installed in the Railway/Docker image (see Dockerfile). Listed first
// only for Arabic documents, so English/French keep using the Latin font as before.
const ARABIC_FONT_FAMILY = 'Noto Naskh Arabic'

function fontStack(language: DocumentLanguage) {
  return language === 'ar' ? `'${ARABIC_FONT_FAMILY}', 'Segoe UI', Arial, sans-serif` : `'Segoe UI', Arial, sans-serif`
}

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The only formatting an estimate/invoice section supports: **bold** spans, written by the admin in the
// editor's Bold toolbar button. Every other character is still escaped - this never allows raw HTML through,
// it only ever wraps escaped text in a literal <b> tag we write ourselves.
export const formatText = (value: unknown) =>
  String(value ?? '')
    .split(/(\*\*[^*]+?\*\*)/g)
    .map((part) => {
      const bold = /^\*\*([^*]+?)\*\*$/.exec(part)
      return bold ? `<b>${escapeHtml(bold[1])}</b>` : escapeHtml(part)
    })
    .join('')

const money = (amount: number | string, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))

const longDate = (isoDate: string | null, language: DocumentLanguage) =>
  isoDate
    ? new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(language === 'ar' ? 'ar' : language === 'fr' ? 'fr-FR' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : ''

const plainNumber = (value: string | number) => String(Number(value))

export type DocItem = { name: string; description: string | null; quantity: string; unit: string; unit_price: string; amount: string }

// A Professional Services Invoice's contract / Acceptance & Signatures block. Never set for an Estimate
// or a Client Funds invoice - those always pass `contract: null` and the section is left out entirely.
export type ContractData = {
  terms: string | null
  clientRepName: string | null
  clientRepTitle: string | null
  nextudioRepName: string | null
  nextudioRepTitle: string | null
}

export type DocumentData = {
  kind: 'quotation' | 'invoice'
  // Only set for `kind: 'invoice'`; distinguishes a Professional Services invoice from a Client Funds one
  // (filenames, and which invoices ever carry a contract) without inferring it from translated text.
  invoiceType?: 'professional_services' | 'client_funds'
  language: DocumentLanguage
  heading: string
  subtitle: string
  number: string
  numberLabel: string
  dateLabel: string
  date: string
  secondDateLabel: string
  secondDate: string | null
  currency: string
  billTo: { name: string; contact: string | null; phone: string | null; email: string | null; address: string | null }
  projectLocation: string | null
  introduction: string | null
  items: DocItem[]
  // Itemized: subtotal comes from the line amounts. Lump Sum: subtotal is the lump sum fee, and items are
  // printed as titled scope sections without quantity/unit/unit price/amount columns.
  pricingMethod: 'itemized' | 'lump_sum'
  subtotal: string
  discount: string
  discountType: string
  discountValue: string
  total: string
  sections: { key: 'paymentTerms' | 'timeline' | 'notes' | 'exclusions'; text: string }[]
  payments: { payment_date: string; amount: string; method: string | null }[]
  amountDue: number | null
  contract: ContractData | null
}

// ---- Layout: modelled on Nextudio's real quotation / invoice PDFs ----

export const headerHtml = (doc: DocumentData) => {
  const t = labelsFor(doc.language)
  const dir = DIRECTION[doc.language]
  return `
<div dir="${dir}" style="width:100%;font-family:${fontStack(doc.language)};padding:0 12mm;box-sizing:border-box;">
  <table style="width:100%;border-collapse:collapse;"><tr>
    <td style="vertical-align:top;width:45%;">
      <img src="${LOGO_DATA_URI}" style="height:46px;margin-top:4px;" />
    </td>
    <td style="vertical-align:top;text-align:${dir === 'rtl' ? 'left' : 'right'};">
      <div style="font-size:30px;font-weight:300;letter-spacing:0.5px;line-height:1;text-transform:uppercase;">${escapeHtml(doc.heading)}</div>
      <div style="font-size:9px;color:#888;text-transform:uppercase;margin:3px 0 8px;">${escapeHtml(doc.subtitle)}</div>
      <div style="font-size:8.5px;line-height:1.35;color:#111;">
        <b>${escapeHtml(COMPANY.name)}</b><br>
        ${COMPANY.addressLines.map(escapeHtml).join('<br>')}<br>
        <span style="display:inline-block;height:4px;"></span><br>
        ${escapeHtml(t.phone)}: <bdi dir="ltr">${escapeHtml(COMPANY.phone)}</bdi><br>
        ${escapeHtml(t.mobile)}: <bdi dir="ltr">${escapeHtml(COMPANY.mobile)}</bdi><br>
        ${escapeHtml(COMPANY.website)}
      </div>
    </td>
  </tr></table>
  <div style="border-bottom:1px solid #ddd;margin-top:6px;"></div>
</div>`
}

export const footerHtml = (doc: DocumentData) => {
  const t = labelsFor(doc.language)
  const word = doc.kind === 'quotation' ? t.quotation : t.invoice
  return `
<div dir="${DIRECTION[doc.language]}" style="width:100%;text-align:center;font-family:${fontStack(doc.language)};font-size:8.5px;color:#888;">
  ${escapeHtml(t.footerPage)} <span class="pageNumber"></span> ${escapeHtml(t.footerOf)} <span class="totalPages"></span> ${escapeHtml(t.footerFor)} ${escapeHtml(word)} #${escapeHtml(doc.number)}
</div>`
}

export function bodyHtml(doc: DocumentData) {
  const { currency, language } = doc
  const t = labelsFor(language)
  const dir = DIRECTION[language]
  const isLumpSum = doc.pricingMethod === 'lump_sum'
  const subtotalLabel = isLumpSum ? t.lumpSumFee : t.subtotal

  const rows = doc.items
    .map(
      (item) => `
      <tr>
        <td class="svc"><div class="svc-name">${escapeHtml(item.name)}</div>${
          item.description ? `<div class="svc-desc">${escapeHtml(item.description)}</div>` : ''
        }</td>
        <td class="num-center">${plainNumber(item.quantity)}</td>
        <td class="num-center">${escapeHtml(UNIT_LABELS[item.unit] ?? item.unit)}</td>
        <td class="num-right">${money(item.unit_price, currency)}</td>
        <td class="num-right">${money(item.amount, currency)}</td>
      </tr>`
    )
    .join('')

  // Lump Sum: scope sections (title + description) only - no per-item pricing columns beside them.
  const scopeSections = doc.items
    .map(
      (item) => `
      <div class="scope-item">
        <div class="scope-name">${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="scope-desc">${escapeHtml(item.description)}</div>` : ''}
      </div>`
    )
    .join('')

  const itemsHtml = isLumpSum
    ? `<div class="scopes">${scopeSections}</div>`
    : `<table class="items">
        <thead><tr><th>${escapeHtml(t.services)}</th><th class="c">${escapeHtml(t.quantity)}</th><th class="c">${escapeHtml(t.unit)}</th><th>${escapeHtml(t.unitPrice)}</th><th>${escapeHtml(t.amount)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`

  const hasDiscount = Number(doc.discount) > 0
  const discountLabel = doc.discountType === 'percent' ? `${plainNumber(doc.discountValue)}% ${t.discount}` : t.discount

  const totals =
    doc.kind === 'quotation'
      ? `
      ${hasDiscount || isLumpSum ? `<tr><td class="t-label">${escapeHtml(subtotalLabel)}:</td><td class="t-value">${money(doc.subtotal, currency)}</td></tr>` : ''}
      ${hasDiscount ? `<tr><td class="t-label">${escapeHtml(discountLabel)}:</td><td class="t-value">(${money(doc.discount, currency)})</td></tr>` : ''}
      <tr class="t-grand"><td class="t-label"><b>${escapeHtml(t.grandTotal)} (${escapeHtml(currency)}):</b></td><td class="t-value"><b>${money(doc.total, currency)}</b></td></tr>`
      : `
      <tr><td class="t-label"><b>${escapeHtml(subtotalLabel)}:</b></td><td class="t-value">${money(doc.subtotal, currency)}</td></tr>
      ${hasDiscount ? `<tr><td class="t-label">${escapeHtml(discountLabel)}:</td><td class="t-value">(${money(doc.discount, currency)})</td></tr>` : ''}
      <tr class="t-grand"><td class="t-label"><b>${escapeHtml(t.total)}:</b></td><td class="t-value">${money(doc.total, currency)}</td></tr>
      ${doc.payments
        .map((p) => {
          const methodText = p.method ? ` ${t.using} ${escapeHtml(t.methods[p.method as keyof typeof t.methods] ?? p.method)}` : ''
          return `<tr><td class="t-label">${escapeHtml(t.paymentOn)} ${escapeHtml(longDate(p.payment_date, language))}${methodText}:</td><td class="t-value">${money(p.amount, currency)}</td></tr>`
        })
        .join('')}
      <tr class="t-grand"><td class="t-label"><b>${escapeHtml(t.amountDue)} (${escapeHtml(currency)}):</b></td><td class="t-value"><b>${money(doc.amountDue ?? 0, currency)}</b></td></tr>`

  const highlight =
    doc.kind === 'quotation'
      ? `<tr class="band"><td class="m-label">${escapeHtml(t.grandTotal)} (${escapeHtml(currency)}):</td><td class="m-value">${money(doc.total, currency)}</td></tr>`
      : `<tr class="band"><td class="m-label">${escapeHtml(t.amountDue)} (${escapeHtml(currency)}):</td><td class="m-value">${money(doc.amountDue ?? 0, currency)}</td></tr>`

  const signatures = signatureSectionHtml(doc)

  return `<!doctype html><html dir="${dir}" lang="${language}"><head><meta charset="utf-8"><style>
    @page { size: A4; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ${fontStack(language)}; font-size: 10px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .meta { display: flex; justify-content: space-between; margin: 2px 0 14px; }
    .bill-to .label { color: #999; font-size: 10px; margin-bottom: 3px; letter-spacing: 0.5px; text-transform: uppercase; }
    .bill-to .name { font-weight: 700; font-size: 11px; }
    .bill-to div { line-height: 1.5; }
    .meta-table { border-collapse: collapse; }
    .meta-table td { padding: 2px 0 2px 10px; vertical-align: top; }
    .m-label { text-align: right; font-weight: 700; white-space: nowrap; }
    .m-value { min-width: 120px; max-width: 200px; overflow-wrap: anywhere; }
    .band td { background: #f1f2f3; font-weight: 700; padding: 4px 8px; }
    .band .m-label { padding-right: 8px; }
    table.items { width: 100%; border-collapse: collapse; }
    table.items thead { display: table-header-group; }
    table.items thead th { background: #000; color: #fff; padding: 8px 8px; font-size: 10px; text-align: right; }
    table.items thead th:first-child { text-align: left; }
    table.items thead th.c { text-align: center; }
    table.items td { padding: 8px 8px; vertical-align: top; }
    table.items tr { page-break-inside: auto; }
    .svc { width: 46%; }
    .svc-name { font-weight: 700; }
    .svc-desc { white-space: pre-wrap; margin-top: 1px; line-height: 1.4; overflow-wrap: anywhere; }
    .scopes { margin: 4px 0; }
    .scope-item { padding: 10px 2px; border-bottom: 1px solid #e5e6e8; page-break-inside: avoid; }
    .scope-item:last-child { border-bottom: none; }
    .scope-name { font-weight: 700; font-size: 10.5px; }
    .scope-desc { white-space: pre-wrap; margin-top: 3px; line-height: 1.5; color: #333; overflow-wrap: anywhere; }
    .num-center { text-align: center; white-space: nowrap; }
    .num-right { text-align: right; white-space: nowrap; }
    .totals { margin-top: 14px; border-top: 2px solid #e5e6e8; padding-top: 8px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
    .totals table { border-collapse: collapse; }
    .totals td { padding: 3px 0 3px 30px; }
    .t-label { text-align: right; }
    .t-value { text-align: right; min-width: 90px; }
    .t-grand td { padding-top: 7px; padding-bottom: 7px; border-top: 2px solid #e5e6e8; font-size: 11px; }
    .intro { margin: 4px 0 18px; font-size: 10.5px; line-height: 1.6; color: #222; white-space: pre-wrap; overflow-wrap: anywhere; }
    .notes { margin-top: 20px; color: #555; font-size: 10px; line-height: 1.55; }
    .notes h4 { margin: 0 0 6px; font-size: 10.5px; color: #444; break-after: avoid; page-break-after: avoid; }
    .notes .text { white-space: pre-wrap; overflow-wrap: anywhere; }
    .thanks { margin-top: 34px; text-align: center; color: #888; font-size: 10px; }
    .signatures { margin-top: 30px; padding-top: 14px; border-top: 2px solid #e5e6e8; page-break-inside: avoid; }
    .signatures h4 { margin: 0 0 8px; font-size: 11.5px; color: #111; break-after: avoid; page-break-after: avoid; }
    .acceptance-text { font-size: 9.5px; line-height: 1.6; color: #333; white-space: pre-wrap; overflow-wrap: anywhere; margin-bottom: 20px; }
    .sig-grid { display: flex; gap: 26px; }
    .sig-block { flex: 1; min-width: 0; }
    .sig-party { font-weight: 700; font-size: 10.5px; padding-bottom: 5px; margin-bottom: 4px; border-bottom: 1px solid #ccc; }
    .sig-row { display: flex; align-items: flex-end; gap: 6px; margin-top: 15px; padding-bottom: 4px; border-bottom: 1px solid #999; font-size: 9.5px; min-height: 12px; }
    .sig-row-label { white-space: nowrap; color: #555; }
    .sig-row-value { flex: 1; overflow-wrap: anywhere; }
    .sig-row-blank { margin-top: 24px; padding-bottom: 26px; }
  </style></head><body>
    <div class="meta">
      <div class="bill-to">
        <div class="label">${escapeHtml(t.billTo)}</div>
        <div class="name">${escapeHtml(doc.billTo.name)}</div>
        ${doc.billTo.contact ? `<div>${escapeHtml(doc.billTo.contact)}</div>` : ''}
        ${doc.billTo.address ? `<div>${escapeHtml(doc.billTo.address)}</div>` : ''}
        ${doc.billTo.phone ? `<div style="margin-top:8px;"><bdi dir="ltr">${escapeHtml(doc.billTo.phone)}</bdi></div>` : ''}
        ${doc.billTo.email ? `<div>${escapeHtml(doc.billTo.email)}</div>` : ''}
      </div>
      <table class="meta-table">
        <tr><td class="m-label">${escapeHtml(doc.numberLabel)}:</td><td class="m-value">${escapeHtml(doc.number)}</td></tr>
        <tr><td class="m-label">${escapeHtml(doc.dateLabel)}:</td><td class="m-value">${escapeHtml(longDate(doc.date, language))}</td></tr>
        ${doc.secondDate ? `<tr><td class="m-label">${escapeHtml(doc.secondDateLabel)}:</td><td class="m-value">${escapeHtml(longDate(doc.secondDate, language))}</td></tr>` : ''}
        ${doc.projectLocation ? `<tr><td class="m-label">${escapeHtml(t.projectLocation)}:</td><td class="m-value">${escapeHtml(doc.projectLocation)}</td></tr>` : ''}
        ${highlight}
      </table>
    </div>
    ${doc.introduction ? `<div class="intro">${formatText(doc.introduction)}</div>` : ''}
    ${itemsHtml}
    <div class="totals"><table>${totals}</table></div>
    ${doc.sections.map((section) => `<div class="notes"><h4>${escapeHtml(t[section.key])}</h4><div class="text">${formatText(section.text)}</div></div>`).join('')}
    <div class="thanks">${escapeHtml(t.thankYou)}</div>
    ${signatures}
  </body></html>`
}

// The Professional Services Invoice's Acceptance & Signatures block. Never rendered for an Estimate or
// a Client Funds invoice (doc.contract is null for both). Both signature blocks are kept in one
// page-break-avoiding container so they aren't split across pages, with generous blank rows for
// handwritten signatures - no electronic signing is implemented.
function signatureSectionHtml(doc: DocumentData) {
  if (!doc.contract) return ''
  const t = labelsFor(doc.language)
  const c = doc.contract

  const block = (party: string, companyName: string, repName: string | null, repTitle: string | null) => `
      <div class="sig-block">
        <div class="sig-party">${escapeHtml(party)}</div>
        <div class="sig-row"><span class="sig-row-label">${escapeHtml(t.companyName)}:</span><span class="sig-row-value">${escapeHtml(companyName)}</span></div>
        <div class="sig-row"><span class="sig-row-label">${escapeHtml(t.authorizedRepresentative)}:</span><span class="sig-row-value">${escapeHtml(repName ?? '')}</span></div>
        <div class="sig-row"><span class="sig-row-label">${escapeHtml(t.titlePosition)}:</span><span class="sig-row-value">${escapeHtml(repTitle ?? '')}</span></div>
        <div class="sig-row sig-row-blank"><span class="sig-row-label">${escapeHtml(t.signature)}:</span><span class="sig-row-value"></span></div>
        <div class="sig-row"><span class="sig-row-label">${escapeHtml(t.signatureDate)}:</span><span class="sig-row-value"></span></div>
      </div>`

  return `
    <div class="signatures">
      <h4>${escapeHtml(t.acceptanceSignatures)}</h4>
      <div class="acceptance-text">${escapeHtml(c.terms && c.terms.trim() ? c.terms : t.acceptanceParagraph)}</div>
      <div class="sig-grid">
        ${block(t.client, doc.billTo.name, c.clientRepName, c.clientRepTitle)}
        ${block(t.nextudioParty, 'Nextudio Architects', c.nextudioRepName, c.nextudioRepTitle)}
      </div>
    </div>`
}
