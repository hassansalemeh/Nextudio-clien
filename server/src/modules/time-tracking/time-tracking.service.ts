import type express from 'express'
import type { PoolClient } from 'pg'
import { hourlyRateFromSalary } from '../../config'
import { withTransaction } from '../../db'
import { HttpError, isIsoDate } from '../../shared'
import * as timeTrackingRepository from './time-tracking.repository'

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function computeHours(startTime: string, endTime: string): number {
  return (timeToMinutes(endTime) - timeToMinutes(startTime)) / 60
}

// Used across several modules (time-tracking, pending-work, projects) for the two Postgres error codes
// that arise from time_entries' overlap-exclusion constraint and attendance's one-open-per-employee index.
export function sendTimeError(res: express.Response, err: unknown, fallback: string) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  const code = (err as { code?: string }).code
  if (code === '23P01') {
    return res.status(400).json({ error: 'This overlaps another time entry for this employee' })
  }
  if (code === '23505') {
    return res.status(400).json({ error: 'This employee already has an active timer or is already clocked in' })
  }
  res.status(500).json({ error: fallback })
}

// Locks the employee's open clock-in row (serialises double clicks) and returns it plus one consistent "now"
async function lockOpenSession(client: PoolClient, employeeId: unknown) {
  const session = await timeTrackingRepository.lockOpenAttendanceSession(client, employeeId)
  if (!session) {
    throw new HttpError(400, 'Clock in first')
  }
  const now = await timeTrackingRepository.selectClockTimestamp(client)
  return { sessionId: session.id as string, now }
}

export async function getTimeStatus(employeeId: string) {
  const session = await timeTrackingRepository.selectOpenAttendanceSession(employeeId)
  const active = await timeTrackingRepository.selectActiveTimeEntry(employeeId)
  return { session: session ?? null, active_entry: active ?? null }
}

export async function getTimeDay(employeeId: string, from: string, to: string) {
  const sessions = await timeTrackingRepository.selectAttendanceSessionsInRange(employeeId, from, to)
  const entries = await timeTrackingRepository.selectTimeEntriesInRange(employeeId, from, to)
  return { sessions, entries }
}

export async function clockIn(employeeId: unknown) {
  const employee = await timeTrackingRepository.selectActiveEmployee(employeeId as string)
  if (!employee) throw new HttpError(400, 'Employee does not exist or is inactive')
  await timeTrackingRepository.insertAttendanceClockIn(employeeId as string)
}

export async function startWork(employeeId: unknown, projectId: unknown, date: string) {
  await withTransaction(async (client) => {
    const { now } = await lockOpenSession(client, employeeId)

    // The client sends its local date; it may only differ from the server date by timezone (at most a day)
    const dateOk = await timeTrackingRepository.selectDateWithinOneDayOfToday(client, date)
    if (!dateOk) {
      throw new HttpError(400, 'Invalid date')
    }

    const assigned = await timeTrackingRepository.selectWorkAssignmentCoversDate(client, employeeId, projectId, date)
    if (!assigned) {
      throw new HttpError(400, 'This project is not assigned to you today')
    }

    const active = await timeTrackingRepository.selectActiveTimeEntryForUpdate(client, employeeId)
    if (active) {
      if (String(active.project_id) === String(projectId)) {
        throw new HttpError(400, 'You are already working on this project')
      }
      // Switching projects: stop the current one at exactly the moment the next one starts
      await timeTrackingRepository.updateTimeEntryEndedAtById(client, active.id, now)
    }

    // Freeze the hourly labor rate on the entry so later salary edits don't change past costs
    const salary = await timeTrackingRepository.selectEmployeeSalary(client, employeeId)
    const rate = hourlyRateFromSalary(Number(salary.monthly_salary))

    await timeTrackingRepository.insertTimeEntryStart(client, employeeId, projectId, now, rate)
  })
}

// Manual entry: the employee forgot to start or stop the timer, or worked on a project before the admin
// assigned it. An entry on an already-assigned project is saved exactly like a finished timer entry (same
// table, same frozen hourly rate), so hours, project totals and labor cost all pick it up automatically.
// An entry on a project the employee isn't assigned to is saved as 'pending' instead: it is held for admin
// review and excluded from every hours/cost total until approved (see recordedTimeByProjectEmployee).
export async function addManualWork(
  employeeId: unknown,
  projectId: unknown,
  date: unknown,
  start: unknown,
  end: unknown,
  dayStart: unknown,
  dayEnd: unknown,
  description: string
) {
  if (!employeeId) throw new HttpError(400, 'employee_id is required')
  if (!projectId) throw new HttpError(400, 'Choose a project')
  if (!isIsoDate(date)) throw new HttpError(400, 'Choose a date')
  const startAt = new Date(start as string)
  const endAt = new Date(end as string)
  const dayStartAt = new Date(dayStart as string)
  const dayEndAt = new Date(dayEnd as string)
  if ([startAt, endAt, dayStartAt, dayEndAt].some((value) => Number.isNaN(value.getTime()))) {
    throw new HttpError(400, 'Enter a start time and an end time')
  }
  if (!description) throw new HttpError(400, 'Describe what you worked on')
  if (description.length > 2000) throw new HttpError(400, 'The description is too long (2000 characters at most)')
  if (endAt <= startAt) throw new HttpError(400, 'End time must be after start time')

  // The chosen day is a 23-25 hour window (daylight saving) and the whole entry must sit inside it
  const dayHours = (dayEndAt.getTime() - dayStartAt.getTime()) / 3600000
  if (dayHours < 23 || dayHours > 25) throw new HttpError(400, 'Invalid date')
  if (startAt < dayStartAt || endAt > dayEndAt) throw new HttpError(400, 'The start and end times must be on the selected date')

  return withTransaction(async (client) => {
    const now = await timeTrackingRepository.selectClockTimestamp(client)
    if (endAt > now) throw new HttpError(400, 'Work cannot be added in the future')

    // Projects assigned to this employee on the selected date save normally. A project they are not
    // assigned to is still allowed, as long as it exists and is open for work, but is held as 'pending'
    // until an admin approves it (see the pending-work module) - it bypasses only this check.
    const assigned = await timeTrackingRepository.selectWorkAssignmentCoversDate(client, employeeId, projectId, date as string)
    let status: 'approved' | 'pending' = 'approved'
    if (!assigned) {
      const project = await timeTrackingRepository.selectProjectStatus(client, projectId)
      if (!project) throw new HttpError(400, 'Project does not exist')
      if (!['planning', 'in_progress'].includes(project.status)) {
        throw new HttpError(400, 'Choose an active project')
      }
      status = 'pending'
    }

    // never overlap another entry, including a project timer that is running right now
    // (a rejected entry never really happened, so it doesn't block a new submission)
    const overlap = await timeTrackingRepository.selectOverlappingTimeEntry(client, employeeId, startAt, endAt)
    if (overlap) {
      throw new HttpError(
        400,
        overlap.ended_at === null
          ? 'This overlaps the project timer that is running right now'
          : 'This overlaps another work entry of yours'
      )
    }

    // Attendance (Clock In/Out) and project work tracking are separate on purpose: real attendance is
    // verified externally (Hikvision/Hik-Connect), so a manual work entry is never required to fall
    // inside - or even have - a Clock In/Out session in this app.

    // same frozen hourly rate as a timer entry
    const salary = await timeTrackingRepository.selectEmployeeSalary(client, employeeId)
    if (!salary) throw new HttpError(400, 'Employee does not exist')
    const rate = hourlyRateFromSalary(Number(salary.monthly_salary))

    await timeTrackingRepository.insertManualTimeEntry(client, employeeId, projectId, startAt, endAt, rate, description, status)
    return status
  })
}

export async function stopWork(employeeId: unknown) {
  await withTransaction(async (client) => {
    const { now } = await lockOpenSession(client, employeeId)
    const stoppedCount = await timeTrackingRepository.stopActiveTimeEntry(client, employeeId, now)
    if (stoppedCount === 0) {
      throw new HttpError(400, 'No project is running')
    }
  })
}

export async function clockOut(employeeId: unknown) {
  await withTransaction(async (client) => {
    const { sessionId, now } = await lockOpenSession(client, employeeId)
    await timeTrackingRepository.updateActiveTimeEntryEndedAtTx(client, employeeId, now)
    await timeTrackingRepository.updateAttendanceClockOut(client, sessionId, now)
  })
}

// Admin corrections. Times are ISO timestamps; end may be null to leave the item running/clocked in.
function parseCorrection(body: { start?: unknown; end?: unknown }) {
  const start = typeof body.start === 'string' ? new Date(body.start) : null
  const end = typeof body.end === 'string' && body.end ? new Date(body.end) : null
  if (!start || Number.isNaN(start.getTime())) {
    throw new HttpError(400, 'A valid start time is required')
  }
  if (end && Number.isNaN(end.getTime())) {
    throw new HttpError(400, 'End time is invalid')
  }
  if (end && end <= start) {
    throw new HttpError(400, 'End time must be after start time')
  }
  return { start, end }
}

export async function correctTimeEntry(id: string, body: { start?: unknown; end?: unknown }) {
  const { start, end } = parseCorrection(body)
  const rowCount = await timeTrackingRepository.updateTimeEntryTimes(id, start, end)
  if (rowCount === 0) {
    throw new HttpError(404, 'Time entry not found')
  }
}

export async function correctAttendanceSession(id: string, body: { start?: unknown; end?: unknown }) {
  const { start, end } = parseCorrection(body)
  const rowCount = await timeTrackingRepository.updateAttendanceTimes(id, start, end)
  if (rowCount === 0) {
    throw new HttpError(404, 'Clock-in record not found')
  }
}

// ---- legacy work_entries (v1 time tracking, left in place but unreachable from the UI) ----

export async function listWorkEntries(projectId: unknown) {
  const rows = await timeTrackingRepository.selectWorkEntries(projectId)
  return rows.map((row) => {
    const hours = computeHours(row.start_time, row.end_time)
    const hourlyRate = Number(row.hourly_rate_snapshot)
    return {
      ...row,
      hours_worked: hours,
      labor_cost: Math.round(hours * hourlyRate * 100) / 100,
    }
  })
}

export async function createWorkEntry(
  projectId: unknown,
  employeeId: unknown,
  workDate: string,
  startTime: string,
  endTime: string
) {
  const projectExists = await timeTrackingRepository.selectProjectExistsForWorkEntry(projectId)
  if (!projectExists) throw new HttpError(400, 'Project does not exist')

  const employee = await timeTrackingRepository.selectEmployeeForWorkEntry(employeeId)
  if (!employee) throw new HttpError(400, 'Employee does not exist')

  const assignment = await timeTrackingRepository.selectActiveAssignmentForWorkEntry(projectId, employeeId)
  if (!assignment) throw new HttpError(400, 'Employee is not actively assigned to this project')

  const overlap = await timeTrackingRepository.selectOverlappingWorkEntry(employeeId, workDate, startTime, endTime)
  if (overlap) throw new HttpError(400, 'This employee already has an overlapping work entry on this date')

  const monthlySalary = Number(employee.monthly_salary)
  const hourlyRate = Math.round((monthlySalary / 176) * 100) / 100

  const entry = await timeTrackingRepository.insertWorkEntry(projectId, employeeId, workDate, startTime, endTime, hourlyRate)
  const hours = computeHours(entry.start_time, entry.end_time)

  return {
    ...entry,
    employee_name: employee.full_name,
    hours_worked: hours,
    labor_cost: Math.round(hours * hourlyRate * 100) / 100,
  }
}
