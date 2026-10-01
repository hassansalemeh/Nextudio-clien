import { useCallback, useEffect, useState } from 'react'
import { dayRange, localDateString } from '../../../shared/lib/timeUtils'
import type { DayData } from '../../../shared/lib/timeUtils'
import { addManualTimeEntry, fetchActiveProjectNames, fetchOwnDay, fetchTimeStatus, fetchWorkAssignmentsForDate, postTimeAction } from '../api'
import AddWorkManuallyForm from '../components/AddWorkManuallyForm'
import AssignedToMeTable from '../components/AssignedToMeTable'
import ClockStatusCard from '../components/ClockStatusCard'
import MyWorkTable from '../components/MyWorkTable'
import type { ActiveProject, Status, TodayAssignment } from '../types'

// The server knows who is logged in and only ever returns/changes that employee's own data
function MyWorkPage() {
  const [status, setStatus] = useState<Status>({ session: null, active_entry: null })
  const [assignments, setAssignments] = useState<TodayAssignment[]>([])
  const [today, setToday] = useState<DayData>({ sessions: [], entries: [] })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [, setTick] = useState(0)

  // "Add Work Manually": for time the employee forgot to record with the timer, or work on a project
  // before it was assigned to them (that goes to an admin for approval instead of being rejected)
  const [workDate, setWorkDate] = useState(localDateString())
  const [dateAssignments, setDateAssignments] = useState<TodayAssignment[]>([])
  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([])
  const [manualProject, setManualProject] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [manualDescription, setManualDescription] = useState('')
  const [manualError, setManualError] = useState('')
  const [manualDone, setManualDone] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  const reload = useCallback(async () => {
    const date = localDateString()
    const { from, to } = dayRange(workDate)
    try {
      const [statusResponse, dayResponse, assignmentsResponse] = await Promise.all([
        fetchTimeStatus(),
        fetchOwnDay(from, to),
        fetchWorkAssignmentsForDate(date),
      ])
      if (!statusResponse.ok || !dayResponse.ok || !assignmentsResponse.ok) {
        throw new Error('Failed to load')
      }
      setStatus(await statusResponse.json())
      setToday(await dayResponse.json())
      setAssignments(await assignmentsResponse.json())
    } catch {
      setError('Could not load your work. Please refresh.')
    }
  }, [workDate])

  useEffect(() => {
    reload()
  }, [reload])

  // All other active projects: choosing one here (not assigned to the employee on this date) is still
  // allowed, but the entry waits for an admin's approval instead of being saved right away.
  useEffect(() => {
    fetchActiveProjectNames()
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setActiveProjects)
      .catch(() => setActiveProjects([]))
  }, [])

  // Projects assigned to the employee on the selected date (these save normally; anything else is pending)
  useEffect(() => {
    if (!workDate) return
    fetchWorkAssignmentsForDate(workDate)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: TodayAssignment[]) => {
        setDateAssignments(data)
      })
      .catch(() => setDateAssignments([]))
  }, [workDate])

  // Keep running durations fresh
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  async function act(path: string, body: Record<string, string> = {}) {
    setError('')
    setBusy(true)
    try {
      const response = await postTimeAction(path, body)
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error || 'Something went wrong.')
      }
    } catch {
      setError('Could not reach the server.')
    } finally {
      await reload()
      setBusy(false)
    }
  }

  async function addManualEntry(event: React.FormEvent) {
    event.preventDefault()
    setManualError('')
    setManualDone('')

    if (!workDate) return setManualError('Choose a date.')
    if (!manualProject) return setManualError('Choose a project.')
    if (!manualStart || !manualEnd) return setManualError('Enter a start time and an end time.')
    if (manualEnd <= manualStart) return setManualError('End time must be after start time.')
    if (!manualDescription.trim()) return setManualError('Describe what you worked on.')

    // Times are typed in local time; the server receives exact instants plus the boundaries of the chosen day
    const { from, to } = dayRange(workDate)
    setManualBusy(true)
    try {
      const data = await addManualTimeEntry({
        project_id: manualProject,
        date: workDate,
        start: new Date(`${workDate}T${manualStart}:00`).toISOString(),
        end: new Date(`${workDate}T${manualEnd}:00`).toISOString(),
        day_start: from,
        day_end: to,
        description: manualDescription,
      })
      setManualStart('')
      setManualEnd('')
      setManualDescription('')
      setManualDone(
        data?.status === 'pending'
          ? 'Submitted — waiting for admin approval.'
          : 'Work entry added.'
      )
      await reload()
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Could not add the work entry.')
    } finally {
      setManualBusy(false)
    }
  }

  // Project dropdown for "Add Work Manually": projects assigned to the employee on this date save normally;
  // any other active project is still offered, but that entry will need an admin's approval
  const assignedProjects = new Map(dateAssignments.map((a) => [String(a.project_id), a.project_name]))
  const otherActiveProjects = activeProjects.filter((project) => !assignedProjects.has(String(project.id)))
  const manualProjectIsAssigned = assignedProjects.has(manualProject)

  return (
    <>
      <h1>My Tasks</h1>
      {error && <p className="error-message">{error}</p>}

      <ClockStatusCard status={status} busy={busy} act={act} />

      <AssignedToMeTable assignments={assignments} status={status} busy={busy} act={act} />

      <AddWorkManuallyForm
        workDate={workDate}
        onWorkDateChange={(value) => {
          // don't show the previous day's entries under the new date while the new day loads
          setToday({ sessions: [], entries: [] })
          setWorkDate(value)
        }}
        manualProject={manualProject}
        setManualProject={setManualProject}
        manualStart={manualStart}
        setManualStart={setManualStart}
        manualEnd={manualEnd}
        setManualEnd={setManualEnd}
        manualDescription={manualDescription}
        setManualDescription={setManualDescription}
        manualError={manualError}
        manualDone={manualDone}
        manualBusy={manualBusy}
        assignedProjects={assignedProjects}
        otherActiveProjects={otherActiveProjects}
        manualProjectIsAssigned={manualProjectIsAssigned}
        onSubmit={addManualEntry}
      />

      <MyWorkTable workDate={workDate} today={today} />
    </>
  )
}

export default MyWorkPage
