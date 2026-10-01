import { localDateString } from '../../../shared/lib/timeUtils'
import type { ActiveProject } from '../types'

type Props = {
  workDate: string
  onWorkDateChange: (value: string) => void
  manualProject: string
  setManualProject: (value: string) => void
  manualStart: string
  setManualStart: (value: string) => void
  manualEnd: string
  setManualEnd: (value: string) => void
  manualDescription: string
  setManualDescription: (value: string) => void
  manualError: string
  manualDone: string
  manualBusy: boolean
  assignedProjects: Map<string, string>
  otherActiveProjects: ActiveProject[]
  manualProjectIsAssigned: boolean
  onSubmit: (event: React.FormEvent) => void
}

function AddWorkManuallyForm({
  workDate,
  onWorkDateChange,
  manualProject,
  setManualProject,
  manualStart,
  setManualStart,
  manualEnd,
  setManualEnd,
  manualDescription,
  setManualDescription,
  manualError,
  manualDone,
  manualBusy,
  assignedProjects,
  otherActiveProjects,
  manualProjectIsAssigned,
  onSubmit,
}: Props) {
  return (
    <div className="card">
      <h2>Add Work Manually</h2>
      <p className="empty-state">Forgot to start or stop the timer? Add the work you did.</p>
      <form onSubmit={onSubmit} noValidate>
        <div className="form-grid">
          <label className="form-field">
            Date
            <input
              type="date"
              value={workDate}
              max={localDateString()}
              onChange={(e) => onWorkDateChange(e.target.value)}
            />
          </label>
          <label className="form-field">
            Project
            <select value={manualProject} onChange={(e) => setManualProject(e.target.value)}>
              <option value="">
                {assignedProjects.size === 0 && otherActiveProjects.length === 0 ? 'No active projects' : 'Select a project'}
              </option>
              {assignedProjects.size > 0 && (
                <optgroup label="Assigned to you on this date">
                  {[...assignedProjects.entries()].map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              )}
              {otherActiveProjects.length > 0 && (
                <optgroup label="Other active projects">
                  {otherActiveProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="form-field">
            Start Time
            <input type="time" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
          </label>
          <label className="form-field">
            End Time
            <input type="time" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label className="form-field">
            Description / What did you work on?
            <textarea
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              placeholder="e.g. Prepared PowerPoint and revised drawings for the client meeting"
            />
          </label>
        </div>
        {manualProject && !manualProjectIsAssigned && (
          <p className="empty-state">
            You are not assigned to this project on this date yet — this entry will be sent to an admin for
            approval and won't count toward hours until then.
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={manualBusy}>
          Add Work Entry
        </button>
        {manualError && <p className="error-message">{manualError}</p>}
        {manualDone && <p className="doc-saved">{manualDone}</p>}
      </form>
    </div>
  )
}

export default AddWorkManuallyForm
