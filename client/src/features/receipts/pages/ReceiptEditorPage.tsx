import CancelWithReasonDialog from '../../../shared/components/CancelWithReasonDialog'
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
    cancelOpen,
    setCancelOpen,
    handleCancel,
    form,
    linkedPayment,
    moneyLocked,
    cancelled,
    cancelReason,
    clients,
    projects,
    signerOptions,
    loading,
    pickingCustomer,
    setPickingCustomer,
    error,
    saved,
    busy,
    update,
    toggleShowPaidStamp,
    toggleShowCompanyStamp,
    client,
    chooseClient,
    handleSave,
    handlePreview,
    applyReceipt,
  } = useReceiptEditor()

  const issuedBySigner = signerOptions.find((signer) => signer.id === form.issued_by_signer_id)
  const receivedBySigner = signerOptions.find((signer) => signer.id === form.received_by_signer_id)

  const actions = (
    <ReceiptActions
      busy={busy}
      isNew={isNew}
      cancelled={cancelled}
      onPreview={handlePreview}
      onOpenEmail={() => setEmailOpen(true)}
      onSave={handleSave}
      onCancel={() => setCancelOpen(true)}
    />
  )

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
      {cancelled && (
        <p className="error-message">
          This receipt is cancelled{cancelReason ? `: ${cancelReason}` : ''}. It can no longer be edited.
        </p>
      )}
      {!cancelled && moneyLocked && (
        <p className="doc-hint">
          Linked to a payment{linkedPayment ? ` of $${Number(linkedPayment.amount).toFixed(2)} on ${linkedPayment.payment_date}` : ''}. Amount, date and
          project come from it - correct the payment to change them.
        </p>
      )}

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
          reason={form.reason}
          onReasonChange={(value) => update('reason', value)}
          signers={signerOptions}
          issuedBySignerId={form.issued_by_signer_id}
          onIssuedBySignerIdChange={(value) => update('issued_by_signer_id', value)}
          receivedBySignerId={form.received_by_signer_id}
          onReceivedBySignerIdChange={(value) => update('received_by_signer_id', value)}
          showPaidStamp={form.show_paid_stamp}
          onShowPaidStampChange={toggleShowPaidStamp}
          showCompanyStamp={form.show_company_stamp}
          onShowCompanyStampChange={toggleShowCompanyStamp}
          documentLanguage={form.document_language}
          onDocumentLanguageChange={(value) => update('document_language', value)}
          moneyLocked={moneyLocked}
          readOnly={cancelled}
        />

        <ReceiptSignaturePreview adminName={issuedBySigner?.display_name ?? ''} receivedByAdmin={receivedBySigner?.display_name ?? ''} />
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

      {cancelOpen && (
        <CancelWithReasonDialog
          title="Cancel this receipt?"
          message="This cancels the receipt and its linked payment together. Neither can be edited afterwards, and the receipt number is never reused."
          confirmLabel="Cancel receipt"
          onConfirm={handleCancel}
          onClose={() => setCancelOpen(false)}
        />
      )}
    </>
  )
}

export default ReceiptEditorPage
