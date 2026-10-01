import { useEffect, useState } from 'react'
import { useConfirm } from '../../../shared/components/ConfirmDialog'
import { createProject, deleteProject as deleteProjectRequest, fetchClientsForProjects, fetchProjects, updateProject } from '../api'
import AddProjectForm from '../components/AddProjectForm'
import ProjectsTable from '../components/ProjectsTable'
import type { ProjectEdit } from '../components/ProjectsTable'
import type { Client, Project } from '../types'

function ProjectsPage() {
  const confirm = useConfirm()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [clients, setClients] = useState<Client[]>([])

  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [totalFee, setTotalFee] = useState('')
  const [feeStatus, setFeeStatus] = useState('pending')
  const [startDate, setStartDate] = useState('')
  const [status, setStatus] = useState('planning')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<ProjectEdit>({
    client_id: '',
    name: '',
    description: '',
    total_fee: '',
    fee_status: 'pending',
    start_date: '',
    status: 'planning',
  })
  const [editError, setEditError] = useState('')

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await fetchProjects()
        setProjects(data)
      } catch {
        setError('Could not load projects.')
      } finally {
        setLoading(false)
      }
    }

    async function loadClients() {
      try {
        const data = await fetchClientsForProjects()
        setClients(data)
      } catch {
        setError('Could not load clients.')
      }
    }

    loadProjects()
    loadClients()
  }, [])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    try {
      const newProject = await createProject({
        client_id: clientId,
        name,
        description,
        total_fee: totalFee === '' ? null : Number(totalFee),
        fee_status: feeStatus,
        start_date: startDate || null,
        status,
      })
      setProjects((previousProjects) => [newProject, ...previousProjects])

      setClientId('')
      setName('')
      setDescription('')
      setTotalFee('')
      setFeeStatus('pending')
      setStartDate('')
      setStatus('planning')
    } catch {
      setError('Could not create project.')
    }
  }

  function startEdit(project: Project) {
    setEditError('')
    setEditingId(project.id)
    setEdit({
      client_id: project.client_id,
      name: project.name,
      description: project.description ?? '',
      total_fee: project.total_fee ?? '',
      fee_status: project.fee_status,
      start_date: project.start_date ?? '',
      status: project.status,
    })
  }

  async function deleteProject(project: Project) {
    const confirmed = await confirm({
      title: `Delete "${project.name}"?`,
      message:
        'This permanently deletes the project and everything related to it: its assignments, all recorded time entries, and its invoice (with any payments) and the quotation it was created from. This cannot be undone.\n\nThe client and employees are kept.',
      confirmLabel: 'Delete project',
      tone: 'danger',
    })
    if (!confirmed) return

    setError('')
    try {
      await deleteProjectRequest(project.id)
      setProjects((previous) => previous.filter((item) => item.id !== project.id))
      if (editingId === project.id) setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete project.')
    }
  }

  async function saveEdit() {
    setEditError('')
    if (!edit.client_id) return setEditError('Client is required.')
    if (!edit.name.trim()) return setEditError('Project name is required.')
    const hasFee = edit.total_fee !== ''
    const fee = Number(edit.total_fee)
    if (hasFee && (Number.isNaN(fee) || fee < 0)) return setEditError('Total fee must be a non-negative number.')
    if (edit.fee_status === 'confirmed' && !hasFee) return setEditError('Enter the fee to confirm it.')

    try {
      const updated = await updateProject(editingId!, { ...edit, total_fee: hasFee ? fee : null, start_date: edit.start_date || null })
      setProjects((previous) => previous.map((project) => (project.id === updated.id ? { ...project, ...updated } : project)))
      setEditingId(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update project.')
    }
  }

  return (
    <>
      <h1>Projects</h1>

      <AddProjectForm
        clients={clients}
        clientId={clientId}
        setClientId={setClientId}
        name={name}
        setName={setName}
        description={description}
        setDescription={setDescription}
        totalFee={totalFee}
        setTotalFee={setTotalFee}
        feeStatus={feeStatus}
        setFeeStatus={setFeeStatus}
        startDate={startDate}
        setStartDate={setStartDate}
        status={status}
        setStatus={setStatus}
        error={error}
        onSubmit={handleSubmit}
      />

      <ProjectsTable
        loading={loading}
        projects={projects}
        clients={clients}
        editingId={editingId}
        edit={edit}
        editError={editError}
        startEdit={startEdit}
        deleteProject={deleteProject}
        saveEdit={saveEdit}
        setEditingId={setEditingId}
        setEdit={setEdit}
      />
    </>
  )
}

export default ProjectsPage
