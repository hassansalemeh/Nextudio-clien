import type { Express } from 'express'
import { pool } from '../db'
import { HttpError, sendError } from '../http'
import { requireBookId, queryId } from './helpers'
import { legacyJobTotals, legacyJobSpendByCategory, legacyJobSpendByPayee, legacyJobHistory, historicalCashByLegacyJob } from './queries'
import { legacyJobFundSummary, historicalReviewNeeded } from './historicalCorrectedQueries'

// Historical-only Polypus jobs (Btater, KZ Residence, Kayfoun, AM Appartment, Chemlen, Souk El Ghareb, ...).
// Deliberately a SEPARATE table and a SEPARATE set of routes from /api/projects - a legacy job is drillable
// (money received/spent, payees, categories, cash movements, full journal history) without ever being, or
// becoming, a real Control project. See accounting_legacy_jobs' migration comment and the historical-import
// report for why: no legacy job has been confirmed-mapped, so mapped_project_id is NULL for every one of them.
export function registerAccountingLegacyJobRoutes(app: Express) {
  app.get('/api/accounting/legacy-jobs', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      const jobs = await pool.query(
        `SELECT id, legacy_job_code, legacy_job_name, status, mapped_project_id FROM accounting_legacy_jobs WHERE book_id = $1 ORDER BY legacy_job_code`,
        [bookId]
      )
      const withTotals = await Promise.all(
        jobs.rows.map(async (row) => ({ ...row, ...(await legacyJobTotals(pool, row.id)), fund_summary: await legacyJobFundSummary(pool, row.id) }))
      )
      res.json(withTotals)
    } catch (err) {
      sendError(res, err, 'Failed to fetch historical jobs')
    }
  })

  app.get('/api/accounting/reports/legacy-job-statement', async (req, res) => {
    try {
      const legacyJobId = queryId(req.query.legacy_job_id)
      if (!legacyJobId) throw new HttpError(400, 'A historical job must be selected')

      const job = await pool.query(
        `SELECT id, book_id, legacy_job_code, legacy_job_name, status, mapped_project_id FROM accounting_legacy_jobs WHERE id = $1`,
        [legacyJobId]
      )
      if (job.rows.length === 0) throw new HttpError(404, 'Historical job not found')

      const totals = await legacyJobTotals(pool, legacyJobId)
      const byCategory = await legacyJobSpendByCategory(pool, legacyJobId)
      const byPayee = await legacyJobSpendByPayee(pool, legacyJobId)
      const history = await legacyJobHistory(pool, legacyJobId)
      // Source-proven fund breakdown (Client Funds Received / Project Costs Paid / Confirmed Fees Collected /
      // Remaining Project Funds), from that job's dedicated historical cash pot where the audit established
      // one exists - null (never a guessed figure) for a job with no dedicated pot.
      const fundSummary = await legacyJobFundSummary(pool, legacyJobId)

      res.json({ legacy_job: job.rows[0], ...totals, fund_summary: fundSummary, spend_by_category: byCategory, spend_by_payee: byPayee, history })
    } catch (err) {
      sendError(res, err, 'Failed to build the historical job statement')
    }
  })

  // Every PRESERVED_AMBIGUOUS historical line, for management to resolve later using paperwork/knowledge -
  // never guessed into a category. See the 100% coverage audit (chat history, 2026-09-29).
  app.get('/api/accounting/historical-review-needed', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      res.json(await historicalReviewNeeded(pool, bookId))
    } catch (err) {
      sendError(res, err, 'Failed to load the historical review list')
    }
  })

  // Book-wide breakdown of historical cash movement by legacy job - used on the Dashboard/Projects overview
  // so "how much of our imported history belongs to Btater vs KZ Residence" doesn't need N separate calls.
  app.get('/api/accounting/legacy-jobs/cash-summary', async (req, res) => {
    try {
      const bookId = requireBookId(req.query.book_id)
      res.json(await historicalCashByLegacyJob(pool, bookId))
    } catch (err) {
      sendError(res, err, 'Failed to summarize historical job cash movement')
    }
  })
}
