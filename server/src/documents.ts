import fs from 'fs'
import path from 'path'
import type { Express } from 'express'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import { loadEstimate } from './estimates'
import { HttpError, sendError } from './http'
import { DIRECTION, DocumentLanguage, labelsFor } from './i18n/documentLabels'
import { loadInvoice } from './invoices'

// The Nextudio logo, embedded so it prints on every page of the PDF
const LOGO_DATA_URI = `data:image/webp;base64,${fs.readFileSync(path.resolve(__dirname, '../assets/nextudio-logo.webp')).toString('base64')}`

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

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The only formatting an estimate/invoice section supports: **bold** spans, written by the admin in the
// editor's Bold toolbar button. Every other character is still escaped - this never allows raw HTML through,
// it only ever wraps escaped text in a literal <b> tag we write ourselves.
const formatText = (value: unknown) =>
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

type DocItem = { name: string; description: string | null; quantity: string; unit: string; unit_price: string; amount: string }

// A Professional Services Invoice's contract / Acceptance & Signatures block. Never set for an Estimate
// or a Client Funds invoice - those always pass `contract: null` and the section is left out entirely.
type ContractData = {
  terms: string | null
  clientRepName: string | null
  clientRepTitle: string | null
  nextudioRepName: string | null
  nextudioRepTitle: string | null
}

type DocumentData = {
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

const headerHtml = (doc: DocumentData) => {
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

const footerHtml = (doc: DocumentData) => {
  const t = labelsFor(doc.language)
  const word = doc.kind === 'quotation' ? t.quotation : t.invoice
  return `
<div dir="${DIRECTION[doc.language]}" style="width:100%;text-align:center;font-family:${fontStack(doc.language)};font-size:8.5px;color:#888;">
  ${escapeHtml(t.footerPage)} <span class="pageNumber"></span> ${escapeHtml(t.footerOf)} <span class="totalPages"></span> ${escapeHtml(t.footerFor)} ${escapeHtml(word)} #${escapeHtml(doc.number)}
</div>`
}

function bodyHtml(doc: DocumentData) {
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

// ---- PDF rendering (Chromium prints the HTML: page breaks, repeated table header, page numbers) ----

function findBrowser(): string {
  const candidates = [
    process.env.PDF_BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const found = candidates.find((path) => path && fs.existsSync(path))
  if (!found) {
    throw new HttpError(500, 'PDF generation needs Microsoft Edge or Google Chrome installed on the server (or set PDF_BROWSER_PATH in server/.env)')
  }
  return found
}

let browserPromise: Promise<Browser> | null = null

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      executablePath: findBrowser(),
      headless: true,
      // Linux servers / containers often need these; PDF_NO_SANDBOX=true is for hosts where Chrome cannot use its sandbox
      args: ['--disable-dev-shm-usage', '--disable-gpu', ...(process.env.PDF_NO_SANDBOX === 'true' ? ['--no-sandbox'] : [])],
    }).then((browser) => {
      browser.on('disconnected', () => {
        browserPromise = null
      })
      return browser
    })
    browserPromise.catch(() => {
      browserPromise = null
    })
  }
  return browserPromise
}

export async function renderPdf(doc: DocumentData): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(bodyHtml(doc), { waitUntil: 'load' })
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: headerHtml(doc),
      footerTemplate: footerHtml(doc),
      margin: { top: '52mm', bottom: '18mm', left: '12mm', right: '12mm' },
    })
  } finally {
    await page.close()
  }
}

// Used by `npm run check` on a new host: really launches the browser and prints a small test PDF
export async function checkPdfEngine(): Promise<{ ok: boolean; browser?: string; bytes?: number; ms?: number; error?: string }> {
  const started = Date.now()
  try {
    const browser = findBrowser()
    const pdf = await renderPdf({
      kind: 'quotation',
      language: 'en',
      heading: 'Quotation',
      subtitle: 'PDF ENGINE CHECK',
      number: 'CHECK',
      numberLabel: 'Estimate Number',
      dateLabel: 'Estimate Date',
      date: '2026-01-01',
      secondDateLabel: 'Valid Until',
      secondDate: null,
      currency: 'USD',
      billTo: { name: 'Check', contact: null, phone: null, email: null, address: null },
      projectLocation: null,
      introduction: null,
      items: [{ name: 'Test service', description: 'Line one\nLine two', quantity: '1', unit: 'ls', unit_price: '1', amount: '1' }],
      pricingMethod: 'itemized',
      subtotal: '1',
      discount: '0',
      discountType: 'fixed',
      discountValue: '0',
      total: '1',
      sections: [],
      payments: [],
      amountDue: null,
      contract: null,
    })
    const valid = pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 1000
    return valid ? { ok: true, browser, bytes: pdf.length, ms: Date.now() - started } : { ok: false, error: 'the browser ran but the result is not a valid PDF' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

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

export function registerDocumentRoutes(app: Express) {
  app.get('/api/estimates/:estimateId/pdf', async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.estimateId)) throw new HttpError(404, 'Estimate not found')
      const doc = await quotationDocument(req.params.estimateId)
      const pdf = await renderPdf(doc)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="Quotation_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the quotation PDF')
    }
  })

  app.get('/api/invoices/:invoiceId/pdf', async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.invoiceId)) throw new HttpError(404, 'Invoice not found')
      const doc = await invoiceDocument(req.params.invoiceId)
      const pdf = await renderPdf(doc)
      const filePrefix = doc.invoiceType === 'client_funds' ? 'ClientFunds' : 'Invoice'
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${filePrefix}_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the invoice PDF')
    }
  })
}
