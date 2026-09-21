import fs from 'fs'
import path from 'path'
import type { Express } from 'express'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import { pool } from './db'
import { loadEstimate } from './estimates'
import { HttpError, sendError } from './http'
import { loadInvoice } from './invoices'

// The Nextudio logo, embedded so it prints on every page of the PDF
const LOGO_DATA_URI = `data:image/webp;base64,${fs.readFileSync(path.resolve(__dirname, '../assets/nextudio-logo.webp')).toString('base64')}`

// ---- Company details printed on every page (from Nextudio's existing quotations and invoices) ----
const COMPANY = {
  name: 'Nextudio.co',
  addressLines: ['Hazmieh | Said Freiha str.', 'Ferekh Bldg. | First floor', 'Beirut, Beyrouth', 'Lebanon'],
  phone: '+961 5 453306',
  mobile: '+ 961 3 898 658 | +961 3 077605 | +961 70 653 987',
  website: 'www.nextudio.co',
}

const UNIT_LABELS: Record<string, string> = { sqm: 'sqm', lm: 'lm', ls: 'ls', pc: 'pc', m3: 'm³', sheet: 'sheet' }
const METHOD_LABELS: Record<string, string> = {
  cash: 'cash',
  bank_transfer: 'bank transfer',
  cheque: 'cheque',
  card: 'card',
  other: 'other',
}

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const money = (amount: number | string, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount))

const longDate = (isoDate: string | null) =>
  isoDate ? new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : ''

const plainNumber = (value: string | number) => String(Number(value))

type DocItem = { name: string; description: string | null; quantity: string; unit: string; unit_price: string; amount: string }

type DocumentData = {
  kind: 'quotation' | 'invoice'
  heading: string
  subtitle: string
  number: string
  numberLabel: string
  dateLabel: string
  date: string
  secondDateLabel: string
  secondDate: string | null
  currency: string
  billTo: { name: string; contact: string | null; phone: string | null; email: string | null }
  items: DocItem[]
  subtotal: string
  discount: string
  discountType: string
  discountValue: string
  total: string
  sections: { title: string; text: string }[]
  payments: { payment_date: string; amount: string; method: string | null }[]
  amountDue: number | null
}

// ---- Layout: modelled on Nextudio's real quotation / invoice PDFs ----

const headerHtml = (doc: DocumentData) => `
<div style="width:100%;font-family:'Segoe UI',Arial,sans-serif;padding:0 12mm;box-sizing:border-box;">
  <table style="width:100%;border-collapse:collapse;"><tr>
    <td style="vertical-align:top;width:45%;">
      <img src="${LOGO_DATA_URI}" style="height:46px;margin-top:4px;" />
    </td>
    <td style="vertical-align:top;text-align:right;">
      <div style="font-size:30px;font-weight:300;letter-spacing:0.5px;line-height:1;">${escapeHtml(doc.heading)}</div>
      <div style="font-size:9px;color:#888;text-transform:uppercase;margin:3px 0 8px;">${escapeHtml(doc.subtitle)}</div>
      <div style="font-size:8.5px;line-height:1.35;color:#111;">
        <b>${escapeHtml(COMPANY.name)}</b><br>
        ${COMPANY.addressLines.map(escapeHtml).join('<br>')}<br>
        <span style="display:inline-block;height:4px;"></span><br>
        Phone: ${escapeHtml(COMPANY.phone)}<br>
        Mobile: ${escapeHtml(COMPANY.mobile)}<br>
        ${escapeHtml(COMPANY.website)}
      </div>
    </td>
  </tr></table>
  <div style="border-bottom:1px solid #ddd;margin-top:6px;"></div>
</div>`

const footerHtml = (doc: DocumentData) => `
<div style="width:100%;text-align:center;font-family:'Segoe UI',Arial,sans-serif;font-size:8.5px;color:#888;">
  Page <span class="pageNumber"></span> of <span class="totalPages"></span> for ${doc.kind === 'quotation' ? 'Quotation' : 'Invoice'} #${escapeHtml(doc.number)}
</div>`

function bodyHtml(doc: DocumentData) {
  const { currency } = doc

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

  const hasDiscount = Number(doc.discount) > 0
  const discountLabel = doc.discountType === 'percent' ? `${plainNumber(doc.discountValue)}% Discount` : 'Discount'

  const totals =
    doc.kind === 'quotation'
      ? `
      ${hasDiscount ? `<tr><td class="t-label">Subtotal:</td><td class="t-value">${money(doc.subtotal, currency)}</td></tr>
      <tr><td class="t-label">${escapeHtml(discountLabel)}:</td><td class="t-value">(${money(doc.discount, currency)})</td></tr>` : ''}
      <tr class="t-grand"><td class="t-label"><b>Grand Total (${escapeHtml(currency)}):</b></td><td class="t-value"><b>${money(doc.total, currency)}</b></td></tr>`
      : `
      <tr><td class="t-label"><b>Subtotal:</b></td><td class="t-value">${money(doc.subtotal, currency)}</td></tr>
      ${hasDiscount ? `<tr><td class="t-label">${escapeHtml(discountLabel)}:</td><td class="t-value">(${money(doc.discount, currency)})</td></tr>` : ''}
      <tr class="t-grand"><td class="t-label"><b>Total:</b></td><td class="t-value">${money(doc.total, currency)}</td></tr>
      ${doc.payments
        .map(
          (p) => `<tr><td class="t-label">Payment on ${escapeHtml(longDate(p.payment_date))}${p.method ? ` using ${escapeHtml(METHOD_LABELS[p.method] ?? p.method)}` : ''}:</td><td class="t-value">${money(p.amount, currency)}</td></tr>`
        )
        .join('')}
      <tr class="t-grand"><td class="t-label"><b>Amount Due (${escapeHtml(currency)}):</b></td><td class="t-value"><b>${money(doc.amountDue ?? 0, currency)}</b></td></tr>`

  const highlight =
    doc.kind === 'quotation'
      ? `<tr class="band"><td class="m-label">Grand Total (${escapeHtml(currency)}):</td><td class="m-value">${money(doc.total, currency)}</td></tr>`
      : `<tr class="band"><td class="m-label">Amount Due (${escapeHtml(currency)}):</td><td class="m-value">${money(doc.amountDue ?? 0, currency)}</td></tr>`

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .meta { display: flex; justify-content: space-between; margin: 2px 0 14px; }
    .bill-to .label { color: #999; font-size: 10px; margin-bottom: 3px; letter-spacing: 0.5px; }
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
    .num-center { text-align: center; white-space: nowrap; }
    .num-right { text-align: right; white-space: nowrap; }
    .totals { margin-top: 14px; border-top: 2px solid #e5e6e8; padding-top: 8px; display: flex; justify-content: flex-end; page-break-inside: avoid; }
    .totals table { border-collapse: collapse; }
    .totals td { padding: 3px 0 3px 30px; }
    .t-label { text-align: right; }
    .t-value { text-align: right; min-width: 90px; }
    .t-grand td { padding-top: 7px; padding-bottom: 7px; border-top: 2px solid #e5e6e8; font-size: 11px; }
    .notes { margin-top: 20px; color: #555; font-size: 10px; line-height: 1.55; }
    .notes h4 { margin: 0 0 6px; font-size: 10.5px; color: #444; break-after: avoid; page-break-after: avoid; }
    .notes .text { white-space: pre-wrap; overflow-wrap: anywhere; }
    .thanks { margin-top: 34px; text-align: center; color: #888; font-size: 10px; }
  </style></head><body>
    <div class="meta">
      <div class="bill-to">
        <div class="label">BILL TO</div>
        <div class="name">${escapeHtml(doc.billTo.name)}</div>
        ${doc.billTo.contact ? `<div>${escapeHtml(doc.billTo.contact)}</div>` : ''}
        ${doc.billTo.phone ? `<div style="margin-top:8px;">${escapeHtml(doc.billTo.phone)}</div>` : ''}
        ${doc.billTo.email ? `<div>${escapeHtml(doc.billTo.email)}</div>` : ''}
      </div>
      <table class="meta-table">
        <tr><td class="m-label">${escapeHtml(doc.numberLabel)}:</td><td class="m-value">${escapeHtml(doc.number)}</td></tr>
        <tr><td class="m-label">${escapeHtml(doc.dateLabel)}:</td><td class="m-value">${escapeHtml(longDate(doc.date))}</td></tr>
        ${doc.secondDate ? `<tr><td class="m-label">${escapeHtml(doc.secondDateLabel)}:</td><td class="m-value">${escapeHtml(longDate(doc.secondDate))}</td></tr>` : ''}
        ${highlight}
      </table>
    </div>
    <table class="items">
      <thead><tr><th>Services</th><th class="c">Quantity</th><th class="c">Unit</th><th>Unit Price</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals"><table>${totals}</table></div>
    ${doc.sections.map((section) => `<div class="notes"><h4>${escapeHtml(section.title)}</h4><div class="text">${escapeHtml(section.text)}</div></div>`).join('')}
    <div class="thanks">Thank you for your cooperation</div>
  </body></html>`
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

async function renderPdf(doc: DocumentData): Promise<Buffer> {
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
      heading: 'QUOTATION',
      subtitle: 'PDF ENGINE CHECK',
      number: 'CHECK',
      numberLabel: 'Estimate Number',
      dateLabel: 'Estimate Date',
      date: '2026-01-01',
      secondDateLabel: 'Valid Until',
      secondDate: null,
      currency: 'USD',
      billTo: { name: 'Check', contact: null, phone: null, email: null },
      items: [{ name: 'Test service', description: 'Line one\nLine two', quantity: '1', unit: 'ls', unit_price: '1', amount: '1' }],
      subtotal: '1',
      discount: '0',
      discountType: 'fixed',
      discountValue: '0',
      total: '1',
      sections: [],
      payments: [],
      amountDue: null,
    })
    const valid = pdf.subarray(0, 4).toString() === '%PDF' && pdf.length > 1000
    return valid ? { ok: true, browser, bytes: pdf.length, ms: Date.now() - started } : { ok: false, error: 'the browser ran but the result is not a valid PDF' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ---- Data -> document ----

// The four terms sections, in the order they are printed; empty ones are left out
function sectionsOf(source: { payment_terms: string | null; timeline: string | null; notes: string | null; exclusions: string | null }) {
  return [
    { title: 'Payment Terms', text: source.payment_terms },
    { title: 'Timeline', text: source.timeline },
    { title: 'Notes', text: source.notes },
    { title: 'Exclusions', text: source.exclusions },
  ].filter((section): section is { title: string; text: string } => !!section.text && section.text.trim() !== '')
}

async function clientFor(clientId: string | null) {
  if (!clientId) return { name: '', phone: null, email: null }
  const result = await pool.query('SELECT name, phone, email FROM clients WHERE id = $1', [clientId])
  return result.rows[0] ?? { name: '', phone: null, email: null }
}

async function quotationDocument(estimateId: string): Promise<DocumentData> {
  const estimate = await loadEstimate(estimateId)
  if (!estimate) throw new HttpError(404, 'Estimate not found')
  const client = await clientFor(estimate.client_id)
  return {
    kind: 'quotation',
    heading: 'QUOTATION',
    subtitle: estimate.summary || estimate.title,
    number: estimate.estimate_number,
    numberLabel: 'Estimate Number',
    dateLabel: 'Estimate Date',
    date: estimate.estimate_date,
    secondDateLabel: 'Valid Until',
    secondDate: estimate.valid_until,
    currency: estimate.currency,
    billTo: { name: client.name || estimate.client_name || '', contact: estimate.contact_name, phone: client.phone, email: client.email },
    items: estimate.items,
    subtotal: estimate.subtotal,
    discount: estimate.discount,
    discountType: estimate.discount_type,
    discountValue: estimate.discount_value,
    total: estimate.total,
    sections: sectionsOf(estimate),
    payments: [],
    amountDue: null,
  }
}

async function invoiceDocument(invoiceId: string): Promise<DocumentData> {
  const invoice = await loadInvoice(invoiceId)
  if (!invoice) throw new HttpError(404, 'Invoice not found')
  return {
    kind: 'invoice',
    heading: 'INVOICE',
    subtitle: invoice.summary || invoice.title,
    number: invoice.invoice_number,
    numberLabel: 'Invoice Number',
    dateLabel: 'Invoice Date',
    date: invoice.invoice_date,
    secondDateLabel: 'Payment Due',
    secondDate: invoice.due_date,
    currency: invoice.currency,
    billTo: { name: invoice.client_name, contact: invoice.contact_name, phone: invoice.client_phone, email: invoice.client_email },
    items: invoice.items,
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    discountType: invoice.discount_type,
    discountValue: invoice.discount_value,
    total: invoice.total,
    sections: sectionsOf(invoice),
    payments: invoice.payments,
    amountDue: invoice.amount_due,
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
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="Invoice_${doc.number.replace(/[^\w.-]+/g, '_')}.pdf"`)
      res.send(pdf)
    } catch (err) {
      sendError(res, err, 'Failed to generate the invoice PDF')
    }
  })
}
