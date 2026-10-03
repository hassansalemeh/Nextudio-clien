import DurationPicker from '../../../shared/components/DurationPicker'
import { DOCUMENT_LANGUAGES, PRICING_METHODS, STATUS_OPTIONS } from '../constants'
import type { Client, Project } from '../types'

type Props = {
  client: Client | undefined
  clients: Client[]
  pickingCustomer: boolean
  setPickingCustomer: (value: boolean) => void
  setCreatingClient: (value: boolean) => void
  chooseClient: (clientId: string) => void
  formClientId: string
  contactName: string
  onContactNameChange: (value: string) => void
  isNew: boolean
  estimateNumber: string
  onEstimateNumberChange: (value: string) => void
  customerRef: string
  onCustomerRefChange: (value: string) => void
  estimateDate: string
  onEstimateDateChange: (value: string) => void
  validUntil: string
  onValidUntilChange: (value: string) => void
  pricingMethod: string
  onPricingMethodChange: (value: string) => void
  isLumpSum: boolean
  documentLanguage: string
  onDocumentLanguageChange: (value: string) => void
  projectId: string
  onProjectIdChange: (value: string) => void
  availableProjects: Project[]
  projectLocation: string
  onProjectLocationChange: (value: string) => void
  status: string
  onStatusChange: (value: string) => void
}

function EstimateCustomerAndMeta({
  client,
  clients,
  pickingCustomer,
  setPickingCustomer,
  setCreatingClient,
  chooseClient,
  formClientId,
  contactName,
  onContactNameChange,
  isNew,
  estimateNumber,
  onEstimateNumberChange,
  customerRef,
  onCustomerRefChange,
  estimateDate,
  onEstimateDateChange,
  validUntil,
  onValidUntilChange,
  pricingMethod,
  onPricingMethodChange,
  isLumpSum,
  documentLanguage,
  onDocumentLanguageChange,
  projectId,
  onProjectIdChange,
  availableProjects,
  projectLocation,
  onProjectLocationChange,
  status,
  onStatusChange,
}: Props) {
  return (
    <div className="doc-meta">
      <div className="doc-customer-box">
        {client ? (
          <div className="doc-customer">
            <strong>{client.name}</strong>
            <label>
              Contact person
              <input value={contactName} onChange={(e) => onContactNameChange(e.target.value)} />
            </label>
            <div>
              <button type="button" className="doc-link" onClick={() => setPickingCustomer(true)}>
                Change
              </button>{' '}
              <button type="button" className="doc-link" onClick={() => chooseClient('')}>
                Remove
              </button>
            </div>
          </div>
        ) : pickingCustomer ? (
          <div className="doc-customer">
            <select autoFocus value="" onChange={(e) => chooseClient(e.target.value)}>
              <option value="">Select a customer</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div>
              <button type="button" className="doc-link" onClick={() => setPickingCustomer(false)}>
                Cancel
              </button>{' '}
              <button type="button" className="doc-link" onClick={() => setCreatingClient(true)}>
                + New Client
              </button>
            </div>
          </div>
        ) : (
          <div className="doc-customer">
            <button type="button" className="doc-add-customer" onClick={() => setPickingCustomer(true)}>
              <span className="doc-avatar" aria-hidden="true">
                ◯
              </span>
              Add customer
            </button>
            <button type="button" className="doc-link" onClick={() => setCreatingClient(true)}>
              + New Client
            </button>
          </div>
        )}
        {client && pickingCustomer && (
          <>
            <select className="doc-customer-picker" autoFocus value={formClientId} onChange={(e) => chooseClient(e.target.value)}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className="doc-link" onClick={() => setCreatingClient(true)}>
              + New Client
            </button>
          </>
        )}
      </div>

      <div className="doc-fields">
        <label htmlFor="est-number">Estimate number</label>
        <div>
          <input id="est-number" value={estimateNumber} onChange={(e) => onEstimateNumberChange(e.target.value)} />
          {isNew && <div className="doc-hint">Generated automatically. You can change it.</div>}
        </div>

        <label htmlFor="est-ref">Customer ref</label>
        <input id="est-ref" value={customerRef} onChange={(e) => onCustomerRefChange(e.target.value)} />

        <label htmlFor="est-date">Date</label>
        <input id="est-date" type="date" value={estimateDate} onChange={(e) => onEstimateDateChange(e.target.value)} />

        <label>Valid until</label>
        <DurationPicker resultLabel="Valid until" baseDate={estimateDate} value={validUntil} onChange={onValidUntilChange} />

        <label htmlFor="est-pricing-method">Pricing Method</label>
        <div>
          <select id="est-pricing-method" value={pricingMethod} onChange={(e) => onPricingMethodChange(e.target.value)}>
            {PRICING_METHODS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="doc-hint">
            {isLumpSum
              ? 'One overall fee for all service sections below. Quantity/unit price are hidden and unused.'
              : 'Each service section is priced by quantity × unit price.'}
          </div>
        </div>

        <label htmlFor="est-document-language">Document Language</label>
        <div>
          <select id="est-document-language" value={documentLanguage} onChange={(e) => onDocumentLanguageChange(e.target.value)}>
            {DOCUMENT_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="doc-hint">The language of the Quotation/Invoice PDF sent to the client. This editor stays in English.</div>
        </div>

        <label htmlFor="est-project">Project</label>
        <div>
          <select id="est-project" value={projectId} onChange={(e) => onProjectIdChange(e.target.value)}>
            <option value="">Create a new project on approval</option>
            {availableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="doc-hint">Pick an existing project to confirm it with this estimate's total.</div>
        </div>

        <label htmlFor="est-location">Project Location</label>
        <div>
          <input
            id="est-location"
            value={projectLocation}
            placeholder="e.g. Beirut, Lebanon"
            onChange={(e) => onProjectLocationChange(e.target.value)}
          />
          <div className="doc-hint">Where the project is, separate from the client's address. Carries into the invoice and project.</div>
        </div>

        <label htmlFor="est-status">Status</label>
        <select id="est-status" value={status} onChange={(e) => onStatusChange(e.target.value)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export default EstimateCustomerAndMeta
