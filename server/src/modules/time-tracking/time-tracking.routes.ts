import type { Express } from 'express'
import { allow, organizationIdOf, resolveEmployeeId } from '../../middleware/auth'
import { Role } from '../../shared'
import { validate } from '../../middleware/validate'
import {
  createWorkEntryBody,
  employeeIdBody,
  employeeIdQuery,
  manualWorkBody,
  startWorkBody,
  timeCorrectionBody,
  timeCorrectionParams,
  timeDayQuery,
  workEntriesListQuery,
} from './time-tracking.schemas'
import * as timeTrackingService from './time-tracking.service'

export function registerTimeTrackingRoutes(app: Express) {
  app.get('/api/work-entries', allow(Role.Admin), validate({ query: workEntriesListQuery }), async (req, res) => {
    try {
      res.json(await timeTrackingService.listWorkEntries(organizationIdOf(req), req.query.project_id as string))
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to fetch work entries')
    }
  })

  app.post('/api/work-entries', allow(Role.Admin), validate({ body: createWorkEntryBody }), async (req, res) => {
    const { project_id, employee_id, work_date, start_time, end_time } = req.body
    if (timeTrackingService.timeToMinutes(end_time) <= timeTrackingService.timeToMinutes(start_time)) {
      return res.status(400).json({ error: 'end_time must be after start_time' })
    }

    try {
      const entry = await timeTrackingService.createWorkEntry(organizationIdOf(req), project_id, employee_id, work_date, start_time, end_time)
      res.status(201).json(entry)
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to create work entry')
    }
  })

  app.get('/api/time/status', allow(Role.Admin, Role.Employee), validate({ query: employeeIdQuery }), async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.query.employee_id) as string | null
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' })
    }

    try {
      res.json(await timeTrackingService.getTimeStatus(organizationIdOf(req), employee_id))
    } catch {
      res.status(500).json({ error: 'Failed to fetch status' })
    }
  })

  // Sessions and entries that started within [from, to) - the client sends the local-day boundaries
  app.get('/api/time/day', allow(Role.Admin, Role.Employee), validate({ query: timeDayQuery }), async (req, res) => {
    const { from, to } = req.query as unknown as { from: string; to: string }
    const employee_id = resolveEmployeeId(req, req.query.employee_id) as string | null
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id, from and to are required' })
    }

    try {
      res.json(await timeTrackingService.getTimeDay(organizationIdOf(req), employee_id, from, to))
    } catch {
      res.status(500).json({ error: 'Failed to fetch time entries' })
    }
  })

  // The earliest activity this employee has ever logged - lets the client tell "before they started" apart from "missed"
  app.get('/api/time/first-activity', allow(Role.Admin, Role.Employee), validate({ query: employeeIdQuery }), async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.query.employee_id) as string | null
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' })
    }
    try {
      res.json(await timeTrackingService.getFirstActivityDate(organizationIdOf(req), employee_id))
    } catch {
      res.status(500).json({ error: 'Failed to fetch first activity date' })
    }
  })

  app.post('/api/time/clock-in', allow(Role.Admin, Role.Employee), validate({ body: employeeIdBody }), async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.body.employee_id) as string | null
    try {
      await timeTrackingService.clockIn(organizationIdOf(req), employee_id)
      res.status(201).json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to clock in')
    }
  })

  app.post('/api/time/start', allow(Role.Admin, Role.Employee), validate({ body: startWorkBody }), async (req, res) => {
    const { project_id, date } = req.body
    const employee_id = resolveEmployeeId(req, req.body.employee_id) as string | null

    try {
      await timeTrackingService.startWork(organizationIdOf(req), employee_id, project_id, date)
      res.status(201).json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to start work')
    }
  })

  app.post('/api/time/manual', allow(Role.Admin, Role.Employee), validate({ body: manualWorkBody }), async (req, res) => {
    // an employee can only ever add time for themselves
    const employee_id = resolveEmployeeId(req, req.body.employee_id) as string | null
    const { project_id, date, start, end, day_start, day_end, description } = req.body

    try {
      const entryStatus = await timeTrackingService.addManualWork(
        organizationIdOf(req),
        employee_id,
        project_id,
        date,
        start,
        end,
        day_start,
        day_end,
        description
      )
      res.status(201).json({ ok: true, status: entryStatus })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to add the work entry')
    }
  })

  app.post('/api/time/stop', allow(Role.Admin, Role.Employee), validate({ body: employeeIdBody }), async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.body.employee_id) as string | null

    try {
      await timeTrackingService.stopWork(organizationIdOf(req), employee_id)
      res.json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to stop work')
    }
  })

  app.post('/api/time/clock-out', allow(Role.Admin, Role.Employee), validate({ body: employeeIdBody }), async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.body.employee_id) as string | null

    try {
      await timeTrackingService.clockOut(organizationIdOf(req), employee_id)
      res.json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to clock out')
    }
  })

  app.patch('/api/time/entries/:id', allow(Role.Admin), validate({ params: timeCorrectionParams, body: timeCorrectionBody }), async (req, res) => {
    try {
      await timeTrackingService.correctTimeEntry(organizationIdOf(req), req.params.id, req.body)
      res.json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to update time entry')
    }
  })
    app.delete('/api/time/entries/:id', allow(Role.Admin), validate({ params: timeCorrectionParams }), async (req, res) => {
    try {
      await timeTrackingService.deleteTimeEntry(organizationIdOf(req), req.params.id)
      res.json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to delete time entry')
    }
  })

  app.patch(
    '/api/time/sessions/:id',
    allow(Role.Admin),
    validate({ params: timeCorrectionParams, body: timeCorrectionBody }),
    async (req, res) => {
      try {
        await timeTrackingService.correctAttendanceSession(organizationIdOf(req), req.params.id, req.body)
        res.json({ ok: true })
      } catch (err) {
        timeTrackingService.sendTimeError(res, err, 'Failed to update clock-in record')
      }
    }
  )
}
