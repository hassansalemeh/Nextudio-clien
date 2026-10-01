import { FEE_STATUS_OPTIONS, STATUS_OPTIONS } from '../constants'
import type { Client } from '../types'

type Props = {
  clients: Client[]
  clientId: string
  setClientId: (value: string) => void
  name: string
  setName: (value: string) => void
  description: string
  setDescription: (value: string) => void
  totalFee: string
  setTotalFee: (value: string) => void
  feeStatus: string
  setFeeStatus: (value: string) => void
  startDate: string
  setStartDate: (value: string) => void
  status: string
  setStatus: (value: string) => void
  error: string
  onSubmit: (event: React.FormEvent) => void
}

function AddProjectForm({
  clients,
  clientId,
  setClientId,
  name,
  setName,
  description,
  setDescription,
  totalFee,
  setTotalFee,
  feeStatus,
  setFeeStatus,
  startDate,
  setStartDate,
  status,
  setStatus,
  error,
  onSubmit,
}: Props) {
  return (
    <div className="card">
      <h2>Add Project</h2>
      <form onSubmit={onSubmit}>
        <div className="form-grid">
          <label className="form-field">
            Client
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="" disabled>
                Select a client
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Project Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="form-field">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="form-field">
            Fee Status
            <select value={feeStatus} onChange={(e) => setFeeStatus(e.target.value)}>
              {FEE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Total Fee
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalFee}
              onChange={(e) => {
                // Entering a fee on a pending project confirms it by default (the admin can switch it back)
                if (feeStatus === 'pending' && totalFee === '' && e.target.value !== '') setFeeStatus('confirmed')
                setTotalFee(e.target.value)
              }}
              required={feeStatus === 'confirmed'}
            />
          </label>
          <label className="form-field">
            Start Date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="form-field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} required>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="empty-state">Only a Confirmed fee counts as project amount in the Financial Summary.</p>
        <button type="submit" className="btn-primary">
          Add Project
        </button>
        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  )
}

export default AddProjectForm
