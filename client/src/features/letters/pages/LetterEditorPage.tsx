import FormattedTextField from '../../../shared/components/FormattedTextField'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import LetterActions from '../components/LetterActions'
import LetterCustomerAndDetails from '../components/LetterCustomerAndDetails'
import LetterSignaturePreview from '../components/LetterSignaturePreview'
import SendLetterEmailDialog from '../components/SendLetterEmailDialog'
import { useLetterEditor } from '../hooks/useLetterEditor'

function LetterEditorPage() {
  const {
    id,
    isNew,
    emailOpen,
    setEmailOpen,
    form,
    clients,
    projects,
    loading,
    pickingCustomer,
    setPickingCustomer,
    error,
    saved,
    busy,
    update,
    useToWhomItMayConcern,
    client,
    chooseClient,
    handleSave,
    handlePreview,
    handleDelete,
    applyLetter,
  } = useLetterEditor()

  const actions = (
    <LetterActions busy={busy} isNew={isNew} onPreview={handlePreview} onOpenEmail={() => setEmailOpen(true)} onSave={handleSave} onDelete={handleDelete} />
  )

  if (loading) {
    return <PageLoader label="Loading letter..." />
  }

  return (
    <>
      <div className="doc-topbar">
        <PageHeader
          title={isNew ? 'New letter' : 'Edit letter'}
          description={isNew ? 'Write a letter and prepare it for signing.' : 'Update this letter before it is signed.'}
        />
        {actions}
      </div>
      {error && <p className="error-message">{error}</p>}
      {saved && <p className="doc-saved">Saved.</p>}

      <div className="doc-sheet">
        <LetterCustomerAndDetails
          client={client}
          clients={clients}
          pickingCustomer={pickingCustomer}
          setPickingCustomer={setPickingCustomer}
          chooseClient={chooseClient}
          formClientId={form.client_id}
          isNew={isNew}
          letterNumber={form.letter_number}
          onLetterNumberChange={(value) => update('letter_number', value)}
          letterDate={form.letter_date}
          onLetterDateChange={(value) => update('letter_date', value)}
          projectId={form.project_id}
          onProjectIdChange={(value) => update('project_id', value)}
          projects={projects}
          recipientName={form.recipient_name}
          onRecipientNameChange={(value) => update('recipient_name', value)}
          onUseToWhomItMayConcern={useToWhomItMayConcern}
          subject={form.subject}
          onSubjectChange={(value) => update('subject', value)}
          issuedByAdmin={form.issued_by_admin}
          onIssuedByAdminChange={(value) => update('issued_by_admin', value)}
          documentLanguage={form.document_language}
          onDocumentLanguageChange={(value) => update('document_language', value)}
        />

        <FormattedTextField
          id="ltr-body"
          label="Body"
          tall
          allowBullets
          value={form.body}
          placeholder={'e.g. We are writing to confirm the following requirements:\n\n- Requirement one\n- Requirement two'}
          onChange={(value) => update('body', value)}
        />
        <div className="doc-hint" style={{ marginTop: '0.5rem' }}>
          Blank line = new paragraph. Use the bullet button (or start a line with "- ") for a list. **word** for bold.
        </div>

        <LetterSignaturePreview adminName={form.issued_by_admin} />
      </div>

      <div className="doc-bottombar">
        {error && <p className="error-message">{error}</p>}
        {saved && <p className="doc-saved">Saved.</p>}
        {actions}
      </div>

      {emailOpen && !isNew && (
        <SendLetterEmailDialog
          letterId={id!}
          recipientEmail={client?.email ?? null}
          recipientName={form.recipient_name}
          subject={form.subject}
          documentLanguage={form.document_language}
          onClose={() => setEmailOpen(false)}
          onSent={(updated) => applyLetter(updated)}
        />
      )}
    </>
  )
}

export default LetterEditorPage
