import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import Spinner from '../../../shared/components/Spinner'
import { COMPANY } from '../../../shared/lib/companyProfile'
import ClientFundsCustomerAndMeta from '../components/ClientFundsCustomerAndMeta'
import ClientFundsItemsSection from '../components/ClientFundsItemsSection'
import { useClientFundsInvoiceEditor } from '../hooks/useClientFundsInvoiceEditor'

function ClientFundsInvoiceEditorPage() {
  const navigate = useNavigate()
  const {
    id,
    isNew,
    form,
    items,
    clients,
    loading,
    notClientFunds,
    locked,
    pickingCustomer,
    setPickingCustomer,
    error,
    saved,
    busy,
    update,
    updateInvoiceDate,
    updateItem,
    moveItem,
    addItem,
    deleteItem,
    lineAmount,
    subtotal,
    discount,
    total,
    client,
    clientProjects,
    chooseClient,
    chooseProject,
    handleSave,
    handlePreview,
  } = useClientFundsInvoiceEditor()

  const actions = (
    <div className="doc-actions">
      <button type="button" className="btn-outline" onClick={() => navigate('/invoices')}>
        Back
      </button>
      <button type="button" className="btn-outline" disabled={busy} onClick={locked ? () => navigate(`/invoices/${id}/preview`) : handlePreview}>
        {busy && <Spinner />} Preview
      </button>
      {!locked && (
        <button type="button" className="btn-pill" disabled={busy} onClick={handleSave}>
          {busy && <Spinner />} Save and continue
        </button>
      )}
      {!isNew && (
        <button type="button" className="btn-convert" onClick={() => navigate(`/invoices/${id}`)}>
          View Invoice
        </button>
      )}
    </div>
  )

  if (notClientFunds) {
    return (
      <>
        <p>
          <Link to="/invoices">← Back to Invoices</Link>
        </p>
        <p className="error-message">
          This is a Professional Services invoice; it was created from an approved estimate and can't be edited here.
        </p>
      </>
    )
  }

  if (loading) {
    return <PageLoader label="Loading invoice..." />
  }

  return (
    <>
      <div className="doc-topbar">
        <PageHeader
          title={isNew ? 'New Client Funds Invoice' : locked ? 'Client Funds Invoice' : 'Edit Client Funds Invoice'}
          description={isNew
            ? 'Record client money set aside for project expenses.'
            : locked
              ? 'Review this client funds invoice and its saved details.'
              : 'Update the client funds invoice before recording payments.'}
        />
        {actions}
      </div>
      {error && <p className="error-message">{error}</p>}
      {saved && <p className="doc-saved">Saved.</p>}
      {locked && (
        <p className="doc-banner">
          This invoice already has a payment recorded and can no longer be edited. Disbursements and further payments are on the invoice page.
        </p>
      )}

      <fieldset disabled={locked} className="doc-fieldset">
        <div className="doc-sheet">
          <ClientFundsCustomerAndMeta
            client={client}
            clients={clients}
            pickingCustomer={pickingCustomer}
            setPickingCustomer={setPickingCustomer}
            chooseClient={chooseClient}
            contactName={form.contact_name}
            onContactNameChange={(value) => update('contact_name', value)}
            isNew={isNew}
            invoiceNumber={form.invoice_number}
            onInvoiceNumberChange={(value) => update('invoice_number', value)}
            customerRef={form.customer_ref}
            onCustomerRefChange={(value) => update('customer_ref', value)}
            invoiceDate={form.invoice_date}
            onInvoiceDateChange={updateInvoiceDate}
            dueDate={form.due_date}
            onDueDateChange={(value) => update('due_date', value)}
            projectId={form.project_id}
            chooseProject={chooseProject}
            clientProjects={clientProjects}
            projectLocation={form.project_location}
            onProjectLocationChange={(value) => update('project_location', value)}
          />

          <ClientFundsItemsSection
            introduction={form.introduction}
            onIntroductionChange={(value) => update('introduction', value)}
            items={items}
            lineAmount={lineAmount}
            currency={form.currency}
            updateItem={updateItem}
            moveItem={moveItem}
            deleteItem={deleteItem}
            addItem={addItem}
            subtotal={subtotal}
            discountType={form.discount_type}
            onDiscountTypeChange={(value) => update('discount_type', value)}
            discountValue={form.discount_value}
            onDiscountValueChange={(value) => update('discount_value', value)}
            discount={discount}
            onCurrencyChange={(value) => update('currency', value)}
            total={total}
            termValues={{
              payment_terms: form.payment_terms,
              timeline: form.timeline,
              notes: form.notes,
              exclusions: form.exclusions,
            }}
            onTermChange={(field, value) => update(field, value)}
          />
        </div>
      </fieldset>

      <div className="doc-bottombar">
        {error && <p className="error-message">{error}</p>}
        {saved && <p className="doc-saved">Saved.</p>}
        {actions}
      </div>
      <p className="doc-hint" style={{ marginTop: '0.5rem' }}>
        Business details: <strong>{COMPANY.name}</strong>, {COMPANY.addressLines.join(', ')}
      </p>
    </>
  )
}

export default ClientFundsInvoiceEditorPage
