import type { Express } from 'express'
import { organizationIdOf, resolveEmployeeId } from '../../middleware/auth'
import { sendError } from '../../shared'
import * as dayOffRequestsService from './day-off-requests.service'

export function registerDayOffRoutes(app: Express) {
  // An employee gets only their own requests; an admin with no employee_id gets the whole organization's
  app.get('/api/day-off-requests', async (req, res) => {
    const employeeId = resolveEmployeeId(req, req.query.employee_id)
    try {
      res.json(await dayOffRequestsService.listDayOffRequests(organizationIdOf(req), typeof employeeId === 'string' ? employeeId : null))
    } catch {
      res.status(500).json({ error: 'Failed to fetch day-off requests' })
    }
  })

  app.post('/api/day-off-requests', async (req, res) => {
    const employeeId = resolveEmployeeId(req, req.body.employee_id)
    if (typeof employeeId !== 'string' || !employeeId) {
      return res.status(400).json({ error: 'employee_id is required' })
    }
    try {
      const created = await dayOffRequestsService.createDayOffRequest(
        organizationIdOf(req),
        employeeId,
        req.user!.employeeName ?? 'An employee',
        req.body.date,
        req.body.reason
      )
      res.json(created)
    } catch (err) {
      sendError(res, err, 'Failed to submit the request')
    }
  })

  // Static path (not /:id/cancel) - the employee route allowlist only matches literal paths
  app.post('/api/day-off-requests/cancel', async (req, res) => {
    const employeeId = resolveEmployeeId(req, req.body.employee_id)
    if (typeof employeeId !== 'string' || !employeeId) {
      return res.status(400).json({ error: 'employee_id is required' })
    }
    try {
      await dayOffRequestsService.cancelDayOffRequest(organizationIdOf(req), employeeId, req.body.id)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to cancel the request')
    }
  })

  // Admin-only (not in EMPLOYEE_ROUTES, so default-denied to employees by enforceRole)
  app.post('/api/day-off-requests/:id/approve', async (req, res) => {
    try {
      await dayOffRequestsService.reviewDayOffRequest(organizationIdOf(req), req.params.id, 'approved', req.user!.id)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to approve the request')
    }
  })

  app.post('/api/day-off-requests/:id/reject', async (req, res) => {
    try {
      await dayOffRequestsService.reviewDayOffRequest(organizationIdOf(req), req.params.id, 'rejected', req.user!.id)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to reject the request')
    }
  })
}
