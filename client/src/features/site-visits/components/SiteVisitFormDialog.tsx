import { useState } from 'react'
import { CloseIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'
import { useConfirm } from '../../../shared/components/ConfirmDialog'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { localDateString } from '../../../shared/lib/timeUtils'
import { createSiteVisit, deleteSiteVisit, updateSiteVisit } from '../api'
import type { SiteVisit, SiteVisitor } from '../types'
import styles from '../SiteVisits.module.css'

type ProjectOption = { id: string; name: string }

type Props = {
  isAdmin: boolean
  visitors: SiteVisitor[]
  ownMemberId: string
  projects: ProjectOption[]
  visit?: SiteVisit | null
  onClose: () => void
  onSaved: () => void
}

// Shared by "Add visit" (create) and editing a card - editing never reassigns the visitor, so that field
// only ever appears for an admin creating a visit, pre-selected on themselves.
function SiteVisitFormDialog({ isAdmin, visitors, ownMemberId, projects, visit, onClose, onSaved }: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const isEdit = !!visit
  const [memberId, setMemberId] = useState(ownMemberId)
  const [projectId, setProjectId] = useState(visit?.project_id ?? '')
  const [date, setDate] = useState(visit?.visit_date ?? localDateString())
  const [startTime, setStartTime] = useState(visit?.start_time ?? '')
  const [endTime, setEndTime] = useState(visit?.end_time ?? '')
  const [note, setNote] = useState(visit?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (isAdmin && !isEdit && !memberId) return setError('Choose a visitor.')
    if (!projectId) return setError('Choose a project.')
    if (!date) return setError('Choose a date.')
    if (date > localDateString()) return setError('Choose a date that is not in the future.')
    if (!startTime) return setError('Enter a start time.')
    if (endTime && endTime <= startTime) return setError('End time must be after start time.')

    setBusy(true)
    try {
      if (isEdit && visit) {
        await updateSiteVisit(visit.id, {
          project_id: projectId,
          visit_date: date,
          start_time: startTime,
          end_time: endTime || null,
          note: note.trim() || null,
        })
      } else {
        await createSiteVisit({
          member_id: isAdmin ? memberId : null,
          project_id: projectId,
          visit_date: date,
          start_time: startTime,
          end_time: endTime || null,
          note: note.trim() || null,
        })
      }
      toast.success(isEdit ? 'Visit updated.' : 'Visit logged.')
      onSaved()
      onClose()
    } catch (err) {
      const message = getErrorMessage(err, 'Could not save the visit.')
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!visit) return
    const ok = await confirm({
      title: 'Delete this visit?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        await deleteSiteVisit(visit.id)
      },
    })
    if (!ok) return
    toast.success('Visit deleted.')
    onSaved()
    onClose()
  }

  return (
    <div className={`modal-overlay ${styles.sheetOverlay}`} onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className={`modal ${styles.sheet}`} role="dialog" aria-modal="true" aria-labelledby="site-visit-title">
        <div className="modal-header">
          <h2 id="site-visit-title">{isEdit ? 'Edit visit' : 'Add visit'}</h2>
          <button type="button" className="doc-icon" aria-label="Close" onClick={onClose} disabled={busy}>
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          {isAdmin && !isEdit && (
            <div className="form-grid">
              <label className="form-field">
                Visitor
                <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                  <option value="">Choose a visitor...</option>
                  {visitors.map((visitor) => (
                    <option key={visitor.id} value={visitor.id}>
                      {visitor.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="form-grid">
            <label className="form-field">
              Project
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Choose a project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-grid">
            <label className="form-field">
              Date
              <input type="date" max={localDateString()} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <div className="form-grid">
            <label className="form-field">
              Start time
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="form-field">
              End time (optional)
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
          </div>

          <div className="form-grid">
            <label className="form-field">
              Note (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Checked site progress" maxLength={500} />
            </label>
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className={`modal-actions ${styles.formActions}`} style={{ marginTop: '1rem' }}>
            {isEdit && (
              <button type="button" className="btn-sm btn-ghost-danger" onClick={handleDelete} disabled={busy}>
                Delete visit
              </button>
            )}
            <div className={styles.formActionsRight}>
              <button type="button" className="btn-sm btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn-sm btn-solid" disabled={busy}>
                {busy && <Spinner />} {isEdit ? 'Save changes' : 'Log visit'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SiteVisitFormDialog
