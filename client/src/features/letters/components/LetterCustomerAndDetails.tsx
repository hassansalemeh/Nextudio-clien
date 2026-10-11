import styles from '../Letters.module.css'
import { ADMIN_SIGNERS, DOCUMENT_LANGUAGES, TO_WHOM_IT_MAY_CONCERN } from '../constants'
import type { Client, Project } from '../types'

type Props = {
  client: Client | undefined
  clients: Client[]
  pickingCustomer: boolean
  setPickingCustomer: (value: boolean) => void
  chooseClient: (clientId: string) => void
  formClientId: string
  isNew: boolean
  letterNumber: string
  onLetterNumberChange: (value: string) => void
  letterDate: string
  onLetterDateChange: (value: string) => void
  projectId: string
  onProjectIdChange: (value: string) => void
  projects: Project[]
  recipientName: string
  onRecipientNameChange: (value: string) => void
  onUseToWhomItMayConcern: () => void
  subject: string
  onSubjectChange: (value: string) => void
  issuedByAdmin: string
  onIssuedByAdminChange: (value: string) => void
  documentLanguage: string
  onDocumentLanguageChange: (value: string) => void
}

function LetterCustomerAndDetails({
  client,
  clients,
  pickingCustomer,
  setPickingCustomer,
  chooseClient,
  formClientId,
  isNew,
  letterNumber,
  onLetterNumberChange,
  letterDate,
  onLetterDateChange,
  projectId,
  onProjectIdChange,
  projects,
  recipientName,
  onRecipientNameChange,
  onUseToWhomItMayConcern,
  subject,
  onSubjectChange,
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
            <div className="doc-hint">Linking a client is optional - it only prefills the recipient's name below.</div>
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
        <label htmlFor="ltr-number">Letter number</label>
        <div>
          <input id="ltr-number" value={letterNumber} onChange={(e) => onLetterNumberChange(e.target.value)} />
          {isNew && <div className="doc-hint">Generated automatically. You can change it.</div>}
        </div>

        <label htmlFor="ltr-date">Date</label>
        <input id="ltr-date" type="date" value={letterDate} onChange={(e) => onLetterDateChange(e.target.value)} />

        <label htmlFor="ltr-project">Project</label>
        <select id="ltr-project" value={projectId} onChange={(e) => onProjectIdChange(e.target.value)}>
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label htmlFor="ltr-recipient">Recipient</label>
        <div className={styles.recipientRow}>
          <input id="ltr-recipient" value={recipientName} onChange={(e) => onRecipientNameChange(e.target.value)} placeholder="e.g. John Doe" />
          <button type="button" className={styles.quickFillBtn} onClick={onUseToWhomItMayConcern}>
            {TO_WHOM_IT_MAY_CONCERN}
          </button>
        </div>

        <label htmlFor="ltr-subject">Subject</label>
        <input id="ltr-subject" value={subject} onChange={(e) => onSubjectChange(e.target.value)} />

        <label htmlFor="ltr-admin">Issued by (admin)</label>
        <select id="ltr-admin" value={issuedByAdmin} onChange={(e) => onIssuedByAdminChange(e.target.value)}>
          <option value="">Choose an admin</option>
          {ADMIN_SIGNERS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <label htmlFor="ltr-document-language">Document Language</label>
        <div>
          <select id="ltr-document-language" value={documentLanguage} onChange={(e) => onDocumentLanguageChange(e.target.value)}>
            {DOCUMENT_LANGUAGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="doc-hint">The language of the Letter PDF sent to the recipient. This editor stays in English.</div>
        </div>
      </div>
    </div>
  )
}

export default LetterCustomerAndDetails
