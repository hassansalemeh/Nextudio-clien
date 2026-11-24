import type { Express } from 'express'
import { allow, organizationIdOf, resolveEmployeeId } from '../../middleware/auth'
import { Role, sendError } from '../../shared'
import { validate } from '../../middleware/validate'
import {
  approveDayOffRequestBody,
  cancelDayOffRequestBody,
  createDayOffRequestBody,
  dayOffListQuery,
  dayOffRequestIdParams,
  recordDaysOffBody,
} from './day-off-requests.schemas'
import * as dayOffRequestsService from './day-off-requests.service'

export function registerDayOffRoutes(app: Express) {
  // An employee gets only their own requests; an admin with no employee_id gets the whole organization's
  app.get('/api/day-off-requests', allow(Role.Admin, Role.Employee), validate({ query: dayOffListQuery }), async (req, res) => {
    const employeeId = resolveEmployeeId(req, req.query.employee_id) as string | null
    try {
      const dayOffRequests = await dayOffRequestsService.listDayOffRequests(organizationIdOf(req), employeeId)
      res.json(req.user!.role === Role.Employee ? dayOffRequests.map(dayOffRequestsService.omitIsPaid) : dayOffRequests)
    } catch {
      res.status(500).json({ error: 'Failed to fetch day-off requests' })
    }
  })

  app.post('/api/day-off-requests', allow(Role.Admin, Role.Employee), validate({ body: createDayOffRequestBody }), async (req, res) => {
    const employeeId = resolveEmployeeId(req, req.body.employee_id) as string | null
    if (!employeeId) {
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
      res.json(req.user!.role === Role.Employee ? dayOffRequestsService.omitIsPaid(created) : created)
    } catch (err) {
      sendError(res, err, 'Failed to submit the request')
    }
  })

  app.post(
    '/api/day-off-requests/cancel',
    allow(Role.Admin, Role.Employee),
    validate({ body: cancelDayOffRequestBody }),
    async (req, res) => {
      const employeeId = resolveEmployeeId(req, req.body.employee_id) as string | null
      if (!employeeId) {
        return res.status(400).json({ error: 'employee_id is required' })
      }
      try {
        await dayOffRequestsService.cancelDayOffRequest(organizationIdOf(req), employeeId, req.body.id)
        res.json({ ok: true })
      } catch (err) {
        sendError(res, err, 'Failed to cancel the request')
      }
    }
  )

  app.post(
    '/api/day-off-requests/:id/approve',
    allow(Role.Admin),
    validate({ params: dayOffRequestIdParams, body: approveDayOffRequestBody }),
    async (req, res) => {
      try {
        await dayOffRequestsService.reviewDayOffRequest(organizationIdOf(req), req.params.id, 'approved', req.user!.id, req.body.is_paid)
        res.json({ ok: true })
      } catch (err) {
        sendError(res, err, 'Failed to approve the request')
      }
    }
  )

  app.post('/api/day-off-requests/:id/reject', allow(Role.Admin), validate({ params: dayOffRequestIdParams }), async (req, res) => {
    try {
      await dayOffRequestsService.reviewDayOffRequest(organizationIdOf(req), req.params.id, 'rejected', req.user!.id)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to reject the request')
    }
  })

  // Admin recording days off directly - no request/approval step, past dates allowed, staff only.
  app.post('/api/day-off-requests/record', allow(Role.Admin), validate({ body: recordDaysOffBody }), async (req, res) => {
    try {
      const result = await dayOffRequestsService.recordDaysOff(
        organizationIdOf(req),
        req.body.employee_id,
        req.body.from,
        req.body.to,
        req.body.is_paid,
        req.user!.id
      )
      res.status(201).json(result)
    } catch (err) {
      sendError(res, err, 'Failed to record the days off')
    }
  })

  // Admin removing a recorded or approved day off by mistake.
  app.delete('/api/day-off-requests/:id', allow(Role.Admin), validate({ params: dayOffRequestIdParams }), async (req, res) => {
    try {
      await dayOffRequestsService.deleteDayOffRequest(organizationIdOf(req), req.params.id)
      res.json({ ok: true })
    } catch (err) {
      sendError(res, err, 'Failed to delete the day off')
    }
  })
}
