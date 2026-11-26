import type { Express } from 'express'
import { allow, organizationIdOf, resolveEmployeeId } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import {
  createSiteVisitBody,
  siteVisitIdParams,
  siteVisitListQuery,
  siteVisitSummaryQuery,
  updateSiteVisitBody,
} from './site-visits.schemas'
import * as siteVisitsService from './site-visits.service'

export function registerSiteVisitRoutes(app: Express) {
  // An employee gets only their own visits; an admin with no employee_id/project_id gets the whole organization's.
  app.get('/api/site-visits', allow(Role.Admin, Role.Employee), validate({ query: siteVisitListQuery }), async (req, res) => {
    const { month, project_id } = req.query as unknown as { month: string; project_id: string | null }
    const employeeId = resolveEmployeeId(req, req.query.employee_id) as string | null
    try {
      const visits = await siteVisitsService.listVisits(organizationIdOf(req), month, employeeId, project_id)
      res.json(visits)
    } catch {
      res.status(500).json({ error: 'Failed to fetch site visits' })
    }
  })

  app.get('/api/site-visits/summary', allow(Role.Admin, Role.Employee), validate({ query: siteVisitSummaryQuery }), async (req, res) => {
    const { month } = req.query as unknown as { month: string }
    const employeeIdScope = req.user!.role === Role.Employee ? req.user!.employeeId : null
    try {
      const summary = await siteVisitsService.buildSummary(organizationIdOf(req), month, employeeIdScope)
      res.json(summary)
    } catch {
      res.status(500).json({ error: 'Failed to build the site visits summary' })
    }
  })

  app.post('/api/site-visits', allow(Role.Admin, Role.Employee), validate({ body: createSiteVisitBody }), async (req, res) => {
    const employeeId = resolveEmployeeId(req, req.body.employee_id) as string | null
    if (!employeeId) {
      return res.status(400).json({ error: 'employee_id is required' })
    }
    try {
      const created = await siteVisitsService.createVisit(
        organizationIdOf(req),
        employeeId,
        req.body.project_id,
        req.body.visit_date,
        req.body.start_time,
        req.body.end_time,
        req.body.note,
        req.user!.id
      )
      res.status(201).json(created)
    } catch (err) {
      sendError(res, err, 'Failed to log the site visit')
    }
  })

  app.patch(
    '/api/site-visits/:id',
    allow(Role.Admin, Role.Employee),
    validate({ params: siteVisitIdParams, body: updateSiteVisitBody }),
    async (req, res) => {
      try {
        await siteVisitsService.updateVisit(
          organizationIdOf(req),
          req.params.id,
          req.user!.role,
          req.user!.employeeId,
          req.body.project_id,
          req.body.visit_date,
          req.body.start_time,
          req.body.end_time,
          req.body.note
        )
        res.json({ ok: true })
      } catch (err) {
        sendError(res, err, 'Failed to update the site visit')
      }
    }
  )

  app.delete('/api/site-visits/:id', allow(Role.Admin, Role.Employee), validate({ params: siteVisitIdParams }), async (req, res) => {
    try {
      await siteVisitsService.deleteVisit(organizationIdOf(req), req.params.id, req.user!.role, req.user!.employeeId)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to delete the site visit')
    }
  })
}
