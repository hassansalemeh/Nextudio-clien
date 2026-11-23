import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { Request, Response } from 'express'

// The page policy: every script must carry this request's nonce. 'strict-dynamic' trusts any script that a
// nonce'd script goes on to load (the lazy-loaded chart chunks), so they do not need their own nonce.
//
// Inline style attributes (style={{...}}) are used across ~23 components, and there is no way to put a nonce on a
// style attribute. Allowing them needs 'unsafe-inline' on style-src, which is the usual compromise: an inline style
// can at most change how the page looks (e.g. resize or reposition something), it cannot run JavaScript or read
// page data, so it is far less dangerous than allowing inline scripts would be.
function pageCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", // the logo is a local file; uploaded signatures/stamps are shown as data: URIs
    "font-src 'self'",
    "connect-src 'self'", // the API is same-origin (VITE_API_URL is empty by default)
    "frame-src 'self' blob:", // the PDF preview shows a generated PDF in an <iframe> from a blob: URL
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'self'", // consistent with X-Frame-Options: SAMEORIGIN
  ].join('; ')
}

// JSON API responses never run scripts or styles, so they get the strictest policy possible instead of the page one.
export const apiCsp = "default-src 'none'; frame-ancestors 'none'"

// Reads index.html once at startup. Each request then gets a fresh nonce stamped onto its <script> tags and sent
// as the Content-Security-Policy header, so every page load uses a different, unguessable nonce.
export function createIndexHtmlHandler(publicDir: string) {
  const template = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
  return (_req: Request, res: Response) => {
    const nonce = crypto.randomBytes(16).toString('base64') // 128 bits of randomness
    const html = template.replace(/<script\b/g, `<script nonce="${nonce}"`)
    res.setHeader('Content-Security-Policy', pageCsp(nonce))
    // A page with a per-request nonce must never be cached and replayed with a stale nonce - no-store, not no-cache.
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  }
}
