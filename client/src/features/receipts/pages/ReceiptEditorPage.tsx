import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import ReceiptActions from '../components/ReceiptActions'
import ReceiptCustomerAndDetails from '../components/ReceiptCustomerAndDetails'
import ReceiptSignaturePreview from '../components/ReceiptSignaturePreview'
import SendReceiptEmailDialog from '../components/SendReceiptEmailDialog'
import { useReceiptEditor } from '../hooks/useReceiptEditor'

function ReceiptEditorPage() {
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
    client,
    chooseClient,
    handleSave,
    handlePreview,
    applyReceipt,
  } = useReceiptEditor()

  const actions = <ReceiptActions busy={busy} isNew={isNew} onPreview={handlePreview} onOpenEmail={() => setEmailOpen(true)} onSave={handleSave} />

  if (loading) {
    return <PageLoader label="Loading receipt..." />
  }

  return (
    <>
      <div className="doc-topbar">
        <PageHeader
          title={isNew ? 'New receipt' : 'Edit receipt'}
          description={isNew ? 'Record a payment received and prepare it for signing.' : 'Update this receipt before it is signed.'}
        />
        {actions}
      </div>
      {error && <p className="error-message">{error}</p>}
      {saved && <p className="doc-saved">Saved.</p>}

      <div className="doc-sheet">
        <ReceiptCustomerAndDetails
          client={client}
          clients={clients}
          pickingCustomer={pickingCustomer}
          setPickingCustomer={setPickingCustomer}
          chooseClient={chooseClient}
          formClientId={form.client_id}
          isNew={isNew}
          receiptNumber={form.receipt_number}
          onReceiptNumberChange={(value) => update('receipt_number', value)}
          receiptDate={form.receipt_date}
          onReceiptDateChange={(value) => update('receipt_date', value)}
          projectId={form.project_id}
          onProjectIdChange={(value) => update('project_id', value)}
          projects={projects}
          receiverName={form.receiver_name}
          onReceiverNameChange={(value) => update('receiver_name', value)}
          receiverEmail={form.receiver_email}
          onReceiverEmailChange={(value) => update('receiver_email', value)}
          amount={form.amount}
          onAmountChange={(value) => update('amount', value)}
          currency={form.currency}
          onCurrencyChange={(value) => update('currency', value)}
          reason={form.reason}
          onReasonChange={(value) => update('reason', value)}
          issuedByAdmin={form.issued_by_admin}
          onIssuedByAdminChange={(value) => update('issued_by_admin', value)}
          documentLanguage={form.document_language}
          onDocumentLanguageChange={(value) => update('document_language', value)}
        />

        <ReceiptSignaturePreview adminName={form.issued_by_admin} receiverName={form.receiver_name} />
      </div>

      <div className="doc-bottombar">
        {error && <p className="error-message">{error}</p>}
        {saved && <p className="doc-saved">Saved.</p>}
        {actions}
      </div>

      {emailOpen && !isNew && (
        <SendReceiptEmailDialog
          receiptId={id!}
          receiverEmail={form.receiver_email || null}
          receiverName={form.receiver_name}
          documentLanguage={form.document_language}
          onClose={() => setEmailOpen(false)}
          onSent={(updated) => applyReceipt(updated)}
        />
      )}
    </>
  )
}

export default ReceiptEditorPage
