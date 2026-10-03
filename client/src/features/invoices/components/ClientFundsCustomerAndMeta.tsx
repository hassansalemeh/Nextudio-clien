import DurationPicker from '../../../shared/components/DurationPicker'
import type { ClientFundsClient, ClientFundsProject } from '../types'

type Props = {
  client: ClientFundsClient | undefined
  clients: ClientFundsClient[]
  pickingCustomer: boolean
  setPickingCustomer: (value: boolean) => void
  chooseClient: (clientId: string) => void
  contactName: string
  onContactNameChange: (value: string) => void
  isNew: boolean
  invoiceNumber: string
  onInvoiceNumberChange: (value: string) => void
  customerRef: string
  onCustomerRefChange: (value: string) => void
  invoiceDate: string
  onInvoiceDateChange: (value: string) => void
  dueDate: string
  onDueDateChange: (value: string) => void
  projectId: string
  chooseProject: (projectId: string) => void
  clientProjects: ClientFundsProject[]
  projectLocation: string
  onProjectLocationChange: (value: string) => void
}

function ClientFundsCustomerAndMeta({
  client,
  clients,
  pickingCustomer,
  setPickingCustomer,
  chooseClient,
  contactName,
  onContactNameChange,
  isNew,
  invoiceNumber,
  onInvoiceNumberChange,
  customerRef,
  onCustomerRefChange,
  invoiceDate,
  onInvoiceDateChange,
  dueDate,
  onDueDateChange,
  projectId,
  chooseProject,
  clientProjects,
  projectLocation,
  onProjectLocationChange,
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
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className="doc-link" onClick={() => setPickingCustomer(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="doc-add-customer" onClick={() => setPickingCustomer(true)}>
            <span className="doc-avatar" aria-hidden="true">
              ◯
            </span>
            Add client
          </button>
        )}
        {client && pickingCustomer && (
          <select className="doc-customer-picker" autoFocus value={client.id} onChange={(e) => chooseClient(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="doc-fields">
        <label htmlFor="cf-number">Invoice number</label>
        <div>
          <input id="cf-number" value={invoiceNumber} onChange={(e) => onInvoiceNumberChange(e.target.value)} />
          {isNew && <div className="doc-hint">Generated automatically. You can change it.</div>}
        </div>

        <label htmlFor="cf-ref">Reference</label>
        <input id="cf-ref" value={customerRef} onChange={(e) => onCustomerRefChange(e.target.value)} />

        <label htmlFor="cf-date">Invoice date</label>
        <input id="cf-date" type="date" value={invoiceDate} onChange={(e) => onInvoiceDateChange(e.target.value)} />

        <label>Payment due date</label>
        <DurationPicker resultLabel="Payment due" baseDate={invoiceDate} value={dueDate} onChange={onDueDateChange} />

        <label htmlFor="cf-project">Project</label>
        <div>
          <select id="cf-project" value={projectId} onChange={(e) => chooseProject(e.target.value)}>
            <option value="">Select the project these funds are for</option>
            {clientProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="doc-hint">Money held for this project's expenses. Choose the client first to narrow the list.</div>
        </div>

        <label htmlFor="cf-location">Project Location</label>
        <input
          id="cf-location"
          value={projectLocation}
          placeholder="e.g. Beirut, Lebanon"
          onChange={(e) => onProjectLocationChange(e.target.value)}
        />
      </div>
    </div>
  )
}

export default ClientFundsCustomerAndMeta
