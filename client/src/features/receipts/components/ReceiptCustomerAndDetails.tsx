import styles from '../Receipts.module.css'
import { ADMIN_SIGNERS, CURRENCIES, DOCUMENT_LANGUAGES } from '../constants'
import type { Client, Project } from '../types'

type Props = {
  client: Client | undefined
  clients: Client[]
  pickingCustomer: boolean
  setPickingCustomer: (value: boolean) => void
  chooseClient: (clientId: string) => void
  formClientId: string
  isNew: boolean
  receiptNumber: string
  onReceiptNumberChange: (value: string) => void
  receiptDate: string
  onReceiptDateChange: (value: string) => void
  projectId: string
  onProjectIdChange: (value: string) => void
  projects: Project[]
  receiverName: string
  onReceiverNameChange: (value: string) => void
  receiverEmail: string
  onReceiverEmailChange: (value: string) => void
  amount: string
  onAmountChange: (value: string) => void
  currency: string
  onCurrencyChange: (value: string) => void
  reason: string
  onReasonChange: (value: string) => void
  issuedByAdmin: string
  onIssuedByAdminChange: (value: string) => void
  documentLanguage: string
  onDocumentLanguageChange: (value: string) => void
}

function ReceiptCustomerAndDetails({
  client,
  clients,
  pickingCustomer,
  setPickingCustomer,
  chooseClient,
  formClientId,
  isNew,
  receiptNumber,
  onReceiptNumberChange,
  receiptDate,
  onReceiptDateChange,
  projectId,
  onProjectIdChange,
  projects,
  receiverName,
  onReceiverNameChange,
  receiverEmail,
  onReceiverEmailChange,
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  reason,
  onReasonChange,
  issuedByAdmin,
  onIssuedByAdminChange,
  documentLanguage,
  onDocumentLanguageChange,
}: Props) {
  return (
    <div className="doc-meta">
      <div className="doc-customer-box">
        {client ? (
          <div className="doc-customer">
            <strong>{client.name}</strong>
            <div className="doc-hint">Linking a client is optional - it only prefills the receiver's name/email below.</div>
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
            <div>
              <button type="button" className="doc-link" onClick={() => setPickingCustomer(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="doc-customer">
            <button type="button" className="doc-add-customer" onClick={() => setPickingCustomer(true)}>
              <span className="doc-avatar" aria-hidden="true">
                ◯
              </span>
              Link a client (optional)
            </button>
          </div>
        )}
        {client && pickingCustomer && (
          <select className="doc-customer-picker" autoFocus value={formClientId} onChange={(e) => chooseClient(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="doc-fields">
        <label htmlFor="rec-number">Receipt number</label>
        <div>
          <input id="rec-number" value={receiptNumber} onChange={(e) => onReceiptNumberChange(e.target.value)} />
          {isNew && <div className="doc-hint">Generated automatically. You can change it.</div>}
        </div>

        <label htmlFor="rec-date">Date</label>
        <input id="rec-date" type="date" value={receiptDate} onChange={(e) => onReceiptDateChange(e.target.value)} />

        <label htmlFor="rec-project">Project</label>
        <select id="rec-project" value={projectId} onChange={(e) => onProjectIdChange(e.target.value)}>
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label htmlFor="rec-receiver">Receiver's name</label>
        <input id="rec-receiver" value={receiverName} onChange={(e) => onReceiverNameChange(e.target.value)} placeholder="e.g. John Doe" />

        <label htmlFor="rec-receiver-email">Receiver's email (optional)</label>
        <input
          id="rec-receiver-email"
          type="email"
          value={receiverEmail}
          onChange={(e) => onReceiverEmailChange(e.target.value)}
          placeholder="Prefills the Send by Email 'To' field"
        />

        <label htmlFor="rec-amount">Amount</label>
        <div className={styles.amountRow}>
          <input id="rec-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => onAmountChange(e.target.value)} />
          <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)} aria-label="Currency">
            {CURRENCIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value}
              </option>
            ))}
          </select>
        </div>

        <label htmlFor="rec-reason">Reason for payment</label>
        <textarea id="rec-reason" value={reason} onChange={(e) => onReasonChange(e.target.value)} placeholder="e.g. First installment for the design fee" />

        <label htmlFor="rec-admin">Issued by (admin)</label>
        <select id="rec-admin" value={issuedByAdmin} onChange={(e) => onIssuedByAdminChange(e.target.value)}>
          <option value="">Choose an admin</option>
          {ADMIN_SIGNERS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <label htmlFor="rec-document-language">Document Language</label>
        <div>
          <select id="rec-document-language" value={documentLanguage} onChange={(e) => onDocumentLanguageChange(e.target.value)}>
            {DOCUMENT_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="doc-hint">The language of the Receipt PDF sent to the receiver. This editor stays in English.</div>
        </div>
      </div>
    </div>
  )
}

export default ReceiptCustomerAndDetails
