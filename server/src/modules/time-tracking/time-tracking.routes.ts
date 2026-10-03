import type { Express } from 'express'
import { organizationIdOf, resolveEmployeeId } from '../../middleware/auth'
import * as timeTrackingService from './time-tracking.service'

export function registerTimeTrackingRoutes(app: Express) {
  app.get('/api/work-entries', async (req, res) => {
    const projectId = req.query.project_id

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required' })
    }

    try {
      res.json(await timeTrackingService.listWorkEntries(organizationIdOf(req), projectId))
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to fetch work entries')
    }
  })

  app.post('/api/work-entries', async (req, res) => {
    const project_id = req.body.project_id
    const employee_id = req.body.employee_id
    const work_date = typeof req.body.work_date === 'string' ? req.body.work_date.trim() : ''
    const start_time = typeof req.body.start_time === 'string' ? req.body.start_time.trim() : ''
    const end_time = typeof req.body.end_time === 'string' ? req.body.end_time.trim() : ''

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' })
    }
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' })
    }
    if (!work_date) {
      return res.status(400).json({ error: 'work_date is required' })
    }
    if (!start_time) {
      return res.status(400).json({ error: 'start_time is required' })
    }
    if (!end_time) {
      return res.status(400).json({ error: 'end_time is required' })
    }
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

  app.get('/api/time/status', async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.query.employee_id)
    if (typeof employee_id !== 'string' || !employee_id) {
      return res.status(400).json({ error: 'employee_id is required' })
    }

    try {
      res.json(await timeTrackingService.getTimeStatus(organizationIdOf(req), employee_id))
    } catch {
      res.status(500).json({ error: 'Failed to fetch status' })
    }
  })

  // Sessions and entries that started within [from, to) - the client sends the local-day boundaries
  app.get('/api/time/day', async (req, res) => {
    const { from, to } = req.query
    const employee_id = resolveEmployeeId(req, req.query.employee_id)
    if (typeof employee_id !== 'string' || !employee_id || typeof from !== 'string' || typeof to !== 'string') {
      return res.status(400).json({ error: 'employee_id, from and to are required' })
    }

    try {
      res.json(await timeTrackingService.getTimeDay(organizationIdOf(req), employee_id, from, to))
    } catch {
      res.status(500).json({ error: 'Failed to fetch time entries' })
    }
  })

  app.post('/api/time/clock-in', async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.body.employee_id)
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' })
    }

    try {
      await timeTrackingService.clockIn(organizationIdOf(req), employee_id)
      res.status(201).json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to clock in')
    }
  })

  app.post('/api/time/start', async (req, res) => {
    const { project_id, date } = req.body
    const employee_id = resolveEmployeeId(req, req.body.employee_id)
    if (!employee_id || !project_id || typeof date !== 'string' || !date) {
      return res.status(400).json({ error: 'employee_id, project_id and date are required' })
    }

    try {
      await timeTrackingService.startWork(organizationIdOf(req), employee_id, project_id, date)
      res.status(201).json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to start work')
    }
  })

  app.post('/api/time/manual', async (req, res) => {
    // an employee can only ever add time for themselves
    const employee_id = resolveEmployeeId(req, req.body.employee_id)
    const { project_id, date, start, end, day_start, day_end } = req.body
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : ''

    try {
      const entryStatus = await timeTrackingService.addManualWork(organizationIdOf(req), employee_id, project_id, date, start, end, day_start, day_end, description)
      res.status(201).json({ ok: true, status: entryStatus })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to add the work entry')
    }
  })

  app.post('/api/time/stop', async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.body.employee_id)
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' })
    }

    try {
      await timeTrackingService.stopWork(organizationIdOf(req), employee_id)
      res.json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to stop work')
    }
  })

  app.post('/api/time/clock-out', async (req, res) => {
    const employee_id = resolveEmployeeId(req, req.body.employee_id)
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' })
    }

    try {
      await timeTrackingService.clockOut(organizationIdOf(req), employee_id)
      res.json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to clock out')
    }
  })

  app.patch('/api/time/entries/:id', async (req, res) => {
    try {
      await timeTrackingService.correctTimeEntry(organizationIdOf(req), req.params.id, req.body)
      res.json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to update time entry')
    }
  })

  app.patch('/api/time/sessions/:id', async (req, res) => {
    try {
      await timeTrackingService.correctAttendanceSession(organizationIdOf(req), req.params.id, req.body)
      res.json({ ok: true })
    } catch (err) {
      timeTrackingService.sendTimeError(res, err, 'Failed to update clock-in record')
    }
  })
}
