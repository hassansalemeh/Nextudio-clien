import { useEffect, useState } from 'react'
import { useToast } from '../../../shared/components/Toast'
import { useAsyncAction } from '../../../shared/hooks/useAsyncAction'
import { getErrorMessage } from '../../../shared/lib/apiError'
import {
  assignEmployeeToProject,
  createWorkAssignment,
  fetchAllEmployees,
  fetchProjectAssignments,
  fetchProjects,
  fetchWorkAssignments,
  updateWorkAssignment,
} from '../api'
import AssignWorkForm from '../components/AssignWorkForm'
import AssignedEmployeesCard from '../components/AssignedEmployeesCard'
import WorkAssignmentsTable from '../components/WorkAssignmentsTable'
import type { Assignment, Employee, Project, WorkAssignment, WorkAssignmentEdit } from '../types'

function AssignWorkPage() {
  const toast = useToast()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsError, setAssignmentsError] = useState('')
  const [employeeToAssign, setEmployeeToAssign] = useState('')

  const [allEmployees, setAllEmployees] = useState<Employee[]>([])

  const [workAssignments, setWorkAssignments] = useState<WorkAssignment[]>([])
  const [workAssignmentsLoading, setWorkAssignmentsLoading] = useState(false)
  const [workAssignmentsError, setWorkAssignmentsError] = useState('')

  const [workEmployeeId, setWorkEmployeeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [taskDescription, setTaskDescription] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<WorkAssignmentEdit>({ project_id: '', employee_id: '', start_date: '', end_date: '', description: '' })
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadProjects() {
      try {
        setProjects(await fetchProjects())
      } catch (err) {
        setWorkAssignmentsError(getErrorMessage(err, 'Could not load projects.'))
      }
    }

    async function loadEmployees() {
      try {
        setAllEmployees(await fetchAllEmployees())
      } catch (err) {
        setAssignmentsError(getErrorMessage(err, 'Could not load employees.'))
      }
    }

    loadProjects()
    loadEmployees()
  }, [])

  useEffect(() => {
    if (!projectId) {
      setAssignments([])
      setWorkAssignments([])
      return
    }

    async function loadAssignments() {
      try {
        setAssignments(await fetchProjectAssignments(projectId))
      } catch (err) {
        setAssignmentsError(getErrorMessage(err, 'Could not load assigned employees.'))
      }
    }

    async function loadWorkAssignments() {
      setWorkAssignmentsLoading(true)
      try {
        setWorkAssignments(await fetchWorkAssignments(projectId))
      } catch (err) {
        setWorkAssignmentsError(getErrorMessage(err, 'Could not load work assignments.'))
      } finally {
        setWorkAssignmentsLoading(false)
      }
    }

    loadAssignments()
    loadWorkAssignments()
  }, [projectId])

  const [handleAssignSubmit, assignSubmitting] = useAsyncAction(async (event: React.FormEvent) => {
    event.preventDefault()
    setAssignmentsError('')

    try {
      const newAssignment = await assignEmployeeToProject(projectId, employeeToAssign)
      setAssignments((previous) => {
        const withoutExisting = previous.filter((a) => a.employee_id !== newAssignment.employee_id)
        return [...withoutExisting, newAssignment].sort((a, b) => a.employee_name.localeCompare(b.employee_name))
      })
      setEmployeeToAssign('')
      toast.success('Employee assigned.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not assign employee.')
      setAssignmentsError(message)
      toast.error(message)
    }
  })

  const [handleWorkAssignmentSubmit, workSubmitting] = useAsyncAction(async (event: React.FormEvent) => {
    event.preventDefault()
    setWorkAssignmentsError('')

    if (!workEmployeeId) {
      setWorkAssignmentsError('Please select an employee.')
      return
    }
    if (!startDate) {
      setWorkAssignmentsError('Start date is required.')
      return
    }
    if (!endDate) {
      setWorkAssignmentsError('End date is required.')
      return
    }
    if (endDate < startDate) {
      setWorkAssignmentsError('End date cannot be before start date.')
      return
    }
    if (!taskDescription.trim()) {
      setWorkAssignmentsError('Task description is required.')
      return
    }

    try {
      const newWorkAssignment = await createWorkAssignment({
        project_id: projectId,
        employee_id: workEmployeeId,
        start_date: startDate,
        end_date: endDate,
        description: taskDescription.trim(),
      })
      setWorkAssignments((previous) => [newWorkAssignment, ...previous])

      setWorkEmployeeId('')
      setStartDate('')
      setEndDate('')
      setTaskDescription('')
      toast.success('Work assigned.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not assign work.')
      setWorkAssignmentsError(message)
      toast.error(message)
    }
  })

  function startEdit(workAssignment: WorkAssignment) {
    setEditError('')
    setEditingId(workAssignment.id)
    setEdit({
      project_id: workAssignment.project_id,
      employee_id: workAssignment.employee_id,
      start_date: workAssignment.start_date,
      end_date: workAssignment.end_date,
      description: workAssignment.description,
    })
  }

  async function saveEdit() {
    setEditError('')
    if (!edit.employee_id) return setEditError('Please select an employee.')
    if (!edit.project_id) return setEditError('Please select a project.')
    if (!edit.start_date) return setEditError('Start date is required.')
    if (!edit.end_date) return setEditError('End date is required.')
    if (edit.end_date < edit.start_date) return setEditError('End date cannot be before start date.')
    if (!edit.description.trim()) return setEditError('Task description is required.')

    setSaving(true)
    try {
      const updated = await updateWorkAssignment(editingId!, { ...edit, description: edit.description.trim() })
      // If it was moved to another project it no longer belongs in this project's list
      setWorkAssignments((previous) =>
        previous
          .map((item) => (item.id === updated.id ? updated : item))
          .filter((item) => String(item.project_id) === String(projectId))
      )
      setEditingId(null)
      toast.success('Assignment updated.')
    } catch (err) {
      const message = getErrorMessage(err, 'Could not update assignment.')
      setEditError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1>Assignments</h1>

      <div className="card">
        <h2>Select Project</h2>
        <div className="form-grid">
          <label className="form-field">
            Project
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {projectId && (
        <>
          <AssignedEmployeesCard
            assignments={assignments}
            assignmentsError={assignmentsError}
            employeeToAssign={employeeToAssign}
            setEmployeeToAssign={setEmployeeToAssign}
            allEmployees={allEmployees}
            submitting={assignSubmitting}
            onSubmit={handleAssignSubmit}
          />

          <AssignWorkForm
            assignments={assignments}
            workEmployeeId={workEmployeeId}
            setWorkEmployeeId={setWorkEmployeeId}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            taskDescription={taskDescription}
            setTaskDescription={setTaskDescription}
            workAssignmentsError={workAssignmentsError}
            submitting={workSubmitting}
            onSubmit={handleWorkAssignmentSubmit}
          />

          <WorkAssignmentsTable
            workAssignmentsLoading={workAssignmentsLoading}
            workAssignments={workAssignments}
            startEdit={startEdit}
            editingId={editingId}
            edit={edit}
            setEdit={setEdit}
            saveEdit={saveEdit}
            saving={saving}
            setEditingId={setEditingId}
            editError={editError}
            projects={projects}
            allEmployees={allEmployees}
          />
        </>
      )}
    </>
  )
}

export default AssignWorkPage
