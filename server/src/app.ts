import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { authenticate, enforceRole } from './middleware/auth'
import { errorHandler } from './middleware/errorHandler'
import { apiNotFound } from './middleware/notFound'
import { requestLogger } from './middleware/requestLogger'
import { registerSecurity } from './middleware/security'
import { pool } from './db'
import { describeError } from './shared'
import { registerAuthRoutes } from './modules/auth/auth.routes'
import { registerClientRoutes } from './modules/clients/clients.routes'
import { registerEmployeeRoutes } from './modules/employees/employees.routes'
import { registerEstimateRoutes } from './modules/estimates/estimates.routes'
import { registerEstimateEmailRoutes } from './modules/estimate-emails/estimate-emails.routes'
import { registerInvoiceRoutes } from './modules/invoices/invoices.routes'
import { registerInvoiceEmailRoutes } from './modules/invoice-emails/invoice-emails.routes'
import { registerDisbursementRoutes } from './modules/disbursements/disbursements.routes'
import { registerPaymentRoutes } from './modules/payments/payments.routes'
import { registerDocumentRoutes } from './modules/documents/documents.routes'
import { registerProjectRoutes } from './modules/projects/projects.routes'
import { registerAssignmentRoutes } from './modules/assignments/assignments.routes'
import { registerTimeTrackingRoutes } from './modules/time-tracking/time-tracking.routes'
import { registerPendingWorkRoutes } from './modules/pending-work/pending-work.routes'
import { registerProjectFinancialsRoutes } from './modules/project-financials/project-financials.routes'
import { registerDashboardRoutes } from './modules/dashboard/dashboard.routes'

export const app = express()

registerSecurity(app)

// In production the website and the API share one address, so no CORS is needed. It is only switched on when
// CORS_ORIGIN is set (for example a separately hosted front end during development).
if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true, exposedHeaders: ['Content-Disposition'] }))
}
app.use(express.json({ limit: '5mb' })) // quotations can carry very long descriptions and terms

app.use('/api', requestLogger)

// Health check: also proves the database can be reached. It only ever answers with these two words, never details.
app.get('/api/health', async (_req, res) => {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('database did not answer within 5 seconds')), 5000)),
    ])
    res.json({ status: 'ok', database: 'ok' })
  } catch (err) {
    console.error('[health] database check failed:', describeError(err))
    res.status(503).json({ status: 'error', database: 'failed' })
  }
})

// Login routes, then authentication + role checks for every other /api route
registerAuthRoutes(app)
app.use('/api', authenticate, enforceRole)

registerEstimateRoutes(app)
registerEstimateEmailRoutes(app)
registerInvoiceRoutes(app)
registerInvoiceEmailRoutes(app)
registerDisbursementRoutes(app)
registerPaymentRoutes(app)
registerDocumentRoutes(app)
registerClientRoutes(app)
registerEmployeeRoutes(app)
registerProjectRoutes(app)
registerAssignmentRoutes(app)
registerTimeTrackingRoutes(app)
registerPendingWorkRoutes(app)
registerProjectFinancialsRoutes(app)
registerDashboardRoutes(app)

// ---- the website itself: the built front end is served by this same server ----
const publicDir = path.resolve(__dirname, '../public')
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  // hashed files under /assets never change, so they can be cached for a year; index.html must always be re-checked
  app.use(express.static(publicDir, { index: false, maxAge: '1h', setHeaders: (res, file) => {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  } }))
  // any other page address (/dashboard, /projects/9 ...) opened directly or refreshed gets the app, which then shows that page
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(publicDir, 'index.html'))
  })
}

// unknown API addresses answer with JSON, never with the app's HTML
app.use('/api', apiNotFound)

// Last resort: log the details on the server, tell the visitor only that something went wrong (never a stack trace)
app.use(errorHandler)
