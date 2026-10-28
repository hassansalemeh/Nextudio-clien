import styles from '../Receipts.module.css'
import type { DocumentSigner } from '../../signatures-and-stamps/document-signers-api'
import { DOCUMENT_LANGUAGES } from '../constants'
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
  reason: string
  onReasonChange: (value: string) => void
  signers: DocumentSigner[]
  issuedBySignerId: string
  onIssuedBySignerIdChange: (value: string) => void
  receivedBySignerId: string
  onReceivedBySignerIdChange: (value: string) => void
  showPaidStamp: boolean
  onShowPaidStampChange: (value: boolean) => void
  showCompanyStamp: boolean
  onShowCompanyStampChange: (value: boolean) => void
  documentLanguage: string
  onDocumentLanguageChange: (value: string) => void
  // True once the receipt is linked to a payment: amount/date/project come from that payment and
  // can only be changed by correcting the payment itself.
  moneyLocked: boolean
  // True once the receipt is cancelled: nothing on it can be changed any more
  readOnly: boolean
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
  reason,
  onReasonChange,
  signers,
  issuedBySignerId,
  onIssuedBySignerIdChange,
  receivedBySignerId,
  onReceivedBySignerIdChange,
  showPaidStamp,
  onShowPaidStampChange,
  showCompanyStamp,
  onShowCompanyStampChange,
  documentLanguage,
  onDocumentLanguageChange,
  moneyLocked,
  readOnly,
}: Props) {
  return (
    <div className="doc-meta">
      <div className="doc-customer-box">
        {client ? (
          <div className="doc-customer">
            <strong>{client.name}</strong>
            <div className="doc-hint">Linking a client is optional - it only prefills the receiver's name/email below.</div>
            {!readOnly && (
              <div>
                <button type="button" className="doc-link" onClick={() => setPickingCustomer(true)}>
                  Change
                </button>{' '}
                <button type="button" className="doc-link" onClick={() => chooseClient('')}>
                  Remove
                </button>
              </div>
            )}
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
            <button type="button" className="doc-add-customer" disabled={readOnly} onClick={() => setPickingCustomer(true)}>
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
          <input id="rec-number" value={receiptNumber} disabled={readOnly} onChange={(e) => onReceiptNumberChange(e.target.value)} />
          {isNew && <div className="doc-hint">Generated automatically. You can change it.</div>}
        </div>

        <label htmlFor="rec-date">Date</label>
        <div>
          <input id="rec-date" type="date" value={receiptDate} disabled={moneyLocked || readOnly} onChange={(e) => onReceiptDateChange(e.target.value)} />
          {moneyLocked && <div className="doc-hint">Comes from the linked payment. Correct the payment to change it.</div>}
        </div>

        <label htmlFor="rec-project">Project</label>
        <div>
          <select id="rec-project" value={projectId} disabled={moneyLocked || readOnly} onChange={(e) => onProjectIdChange(e.target.value)}>
            <option value="">{moneyLocked ? 'Loading...' : 'No project'}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {moneyLocked && <div className="doc-hint">Comes from the linked payment.</div>}
          {!moneyLocked && isNew && <div className="doc-hint">Required for a new receipt - it creates the payment behind it.</div>}
        </div>

        <label htmlFor="rec-receiver">Received from (who paid)</label>
        <input id="rec-receiver" value={receiverName} disabled={readOnly} onChange={(e) => onReceiverNameChange(e.target.value)} placeholder="e.g. John Doe" />

        <label htmlFor="rec-receiver-email">Payer's email (optional)</label>
        <input
          id="rec-receiver-email"
          type="email"
          value={receiverEmail}
          disabled={readOnly}
          onChange={(e) => onReceiverEmailChange(e.target.value)}
          placeholder="Prefills the Send by Email 'To' field"
        />

        <label htmlFor="rec-amount">Amount</label>
        <div>
          <div className={styles.amountRow}>
            <input
              id="rec-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              disabled={moneyLocked || readOnly}
              onChange={(e) => onAmountChange(e.target.value)}
            />
            <span aria-label="Currency">USD</span>
          </div>
          {moneyLocked && <div className="doc-hint">Comes from the linked payment. Correct the payment to change it.</div>}
        </div>

        <label htmlFor="rec-reason">Reason for payment</label>
        <textarea
          id="rec-reason"
          value={reason}
          disabled={readOnly}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="e.g. First installment for the design fee"
        />

        <label htmlFor="rec-admin">Issued by</label>
        <select id="rec-admin" value={issuedBySignerId} disabled={readOnly} onChange={(e) => onIssuedBySignerIdChange(e.target.value)}>
          <option value="">Choose a signer</option>
          {signers.map((signer) => (
            <option key={signer.id} value={signer.id}>
              {signer.display_name}
            </option>
          ))}
        </select>

        <label htmlFor="rec-received-by">Received by</label>
        <div>
          <select id="rec-received-by" value={receivedBySignerId} disabled={readOnly} onChange={(e) => onReceivedBySignerIdChange(e.target.value)}>
            <option value="">Choose a signer</option>
            {signers.map((signer) => (
              <option key={signer.id} value={signer.id}>
                {signer.display_name}
              </option>
            ))}
          </select>
          <div className="doc-hint">Who physically received the money and signs for it. Can be the same person as above.</div>
        </div>

        <label htmlFor="rec-paid-stamp">PAID stamp</label>
        <label className="email-attach-check">
          <input
            id="rec-paid-stamp"
            type="checkbox"
            checked={showPaidStamp}
            disabled={readOnly}
            onChange={(e) => onShowPaidStampChange(e.target.checked)}
          />
          Show on the PDF
        </label>

        <label htmlFor="rec-company-stamp">Company stamp</label>
        <label className="email-attach-check">
          <input
            id="rec-company-stamp"
            type="checkbox"
            checked={showCompanyStamp}
            disabled={readOnly}
            onChange={(e) => onShowCompanyStampChange(e.target.checked)}
          />
          Show on the PDF
        </label>

        <label htmlFor="rec-document-language">Document Language</label>
        <div>
          <select id="rec-document-language" value={documentLanguage} disabled={readOnly} onChange={(e) => onDocumentLanguageChange(e.target.value)}>
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
