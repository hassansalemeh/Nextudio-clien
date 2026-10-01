import { PencilIcon } from '../../../shared/components/icons'
import Spinner from '../../../shared/components/Spinner'
import type { InvoiceDetail } from '../types'

type Props = {
  invoice: InvoiceDetail
  contractEditing: boolean
  contractTerms: string
  setContractTerms: (value: string) => void
  clientRepName: string
  setClientRepName: (value: string) => void
  clientRepTitle: string
  setClientRepTitle: (value: string) => void
  nextudioRepName: string
  setNextudioRepName: (value: string) => void
  nextudioRepTitle: string
  setNextudioRepTitle: (value: string) => void
  contractError: string
  contractSaving: boolean
  startContractEdit: () => void
  saveContract: () => void
  setContractEditing: (value: boolean) => void
}

function InvoiceContractCard({
  invoice,
  contractEditing,
  contractTerms,
  setContractTerms,
  clientRepName,
  setClientRepName,
  clientRepTitle,
  setClientRepTitle,
  nextudioRepName,
  setNextudioRepName,
  nextudioRepTitle,
  setNextudioRepTitle,
  contractError,
  contractSaving,
  startContractEdit,
  saveContract,
  setContractEditing,
}: Props) {
  return (
    <div className="card">
      <h2>Acceptance & Signatures (Contract)</h2>
      <p className="doc-hint" style={{ marginTop: 0 }}>
        Shown at the end of this invoice's PDF only - never on the Estimate/Quotation, and never on a Client Funds invoice.
      </p>
      {contractEditing ? (
        <>
          <label className="form-field">
            Contract / Acceptance Terms (optional - a default acceptance paragraph is used in the PDF if left blank)
            <textarea className="email-message" value={contractTerms} onChange={(e) => setContractTerms(e.target.value)} />
          </label>
          <div className="form-grid">
            <label className="form-field">
              Client Authorized Representative
              <input value={clientRepName} onChange={(e) => setClientRepName(e.target.value)} />
            </label>
            <label className="form-field">
              Client Representative Title
              <input value={clientRepTitle} onChange={(e) => setClientRepTitle(e.target.value)} />
            </label>
            <label className="form-field">
              Nextudio Authorized Representative
              <input value={nextudioRepName} onChange={(e) => setNextudioRepName(e.target.value)} />
            </label>
            <label className="form-field">
              Nextudio Representative Title
              <input value={nextudioRepTitle} onChange={(e) => setNextudioRepTitle(e.target.value)} />
            </label>
          </div>
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn-sm btn-solid" disabled={contractSaving} onClick={saveContract}>
              {contractSaving && <Spinner />} Save
            </button>
            <button type="button" className="btn-sm btn-ghost" disabled={contractSaving} onClick={() => setContractEditing(false)}>
              Cancel
            </button>
          </div>
          {contractError && <p className="error-message">{contractError}</p>}
        </>
      ) : (
        <>
          {invoice.contract_terms && (
            <div className="terms-view" style={{ marginTop: 0 }}>
              <div className="terms-text">{invoice.contract_terms}</div>
            </div>
          )}
          <p>
            Client Authorized Representative: <strong>{invoice.client_representative_name || '—'}</strong>
            {invoice.client_representative_title ? ` (${invoice.client_representative_title})` : ''}
          </p>
          <p>
            Nextudio Authorized Representative: <strong>{invoice.nextudio_representative_name || '—'}</strong>
            {invoice.nextudio_representative_title ? ` (${invoice.nextudio_representative_title})` : ''}
          </p>
          <button type="button" className="btn-sm btn-ghost" onClick={startContractEdit}>
            <PencilIcon /> Edit
          </button>
        </>
      )}
    </div>
  )
}

export default InvoiceContractCard
