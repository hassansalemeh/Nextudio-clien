import { useEffect, useState } from 'react'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { dayRange } from '../../../shared/lib/timeUtils'
import { addManualTimeEntryForEmployee, fetchActiveProjectNames, fetchWorkAssignmentsForEmployeeDate } from '../api'
import type { ActiveProject, TodayAssignment } from '../types'
import AddWorkManuallyForm from './AddWorkManuallyForm'

type Props = {
  employeeId: string
  date: string
  onSaved: () => void
}

// The admin's way to add hours for an employee who doesn't log in themselves (a site worker) - or for
// anyone else, on a day they forgot. Same route and same frozen-rate behavior as "Add Work Manually" on
// an employee's own My Tasks page; this just lets the admin pick the employee and the date instead.
function AddHoursForEmployeeForm({ employeeId, date, onSaved }: Props) {
  const toast = useToast()
  const [activeProjects, setActiveProjects] = useState<ActiveProject[]>([])
  const [dateAssignments, setDateAssignments] = useState<TodayAssignment[]>([])
  const [project, setProject] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchActiveProjectNames()
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setActiveProjects)
      .catch(() => setActiveProjects([]))
  }, [])

  useEffect(() => {
    setProject('')
    setError('')
    setDone('')
    if (!employeeId || !date) return
    fetchWorkAssignmentsForEmployeeDate(employeeId, date)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: TodayAssignment[]) => setDateAssignments(data))
      .catch(() => setDateAssignments([]))
  }, [employeeId, date])

  const assignedProjects = new Map(dateAssignments.map((a) => [String(a.project_id), a.project_name]))
  const otherActiveProjects = activeProjects.filter((p) => !assignedProjects.has(String(p.id)))
  const projectIsAssigned = assignedProjects.has(project)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setDone('')

    if (!project) return setError('Choose a project.')
    if (!start || !end) return setError('Enter a start time and an end time.')
    if (end <= start) return setError('End time must be after start time.')
    if (!description.trim()) return setError('Describe what the work was.')

    const { from, to } = dayRange(date)
    setBusy(true)
    try {
      const data = await addManualTimeEntryForEmployee(employeeId, {
        project_id: project,
        date,
        start: new Date(`${date}T${start}:00`).toISOString(),
        end: new Date(`${date}T${end}:00`).toISOString(),
        day_start: from,
        day_end: to,
        description,
      })
      setStart('')
      setEnd('')
      setDescription('')
      const message = data?.status === 'pending' ? 'Submitted — waiting for admin approval.' : 'Hours added.'
      setDone(message)
      toast.success(message)
      onSaved()
    } catch (err) {
      const message = getErrorMessage(err, 'Could not add the hours.')
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AddWorkManuallyForm
      workDate={date}
      onWorkDateChange={() => {}}
      manualProject={project}
      setManualProject={setProject}
      manualStart={start}
      setManualStart={setStart}
      manualEnd={end}
      setManualEnd={setEnd}
      manualDescription={description}
      setManualDescription={setDescription}
      manualError={error}
      manualDone={done}
      manualBusy={busy}
      assignedProjects={assignedProjects}
      otherActiveProjects={otherActiveProjects}
      manualProjectIsAssigned={projectIsAssigned}
      onSubmit={handleSubmit}
    />
  )
}

export default AddHoursForEmployeeForm
