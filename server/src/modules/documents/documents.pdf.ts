import fs from 'fs'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import { HttpError } from '../../shared'
import { bodyHtml, headerHtml, footerHtml, DocumentData } from './documents.layout'

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
