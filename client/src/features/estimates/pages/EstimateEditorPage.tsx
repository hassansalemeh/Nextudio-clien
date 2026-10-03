import { Link } from 'react-router-dom'
import PageHeader from '../../../shared/components/PageHeader'
import PageLoader from '../../../shared/components/PageLoader'
import CreateClientDialog from '../components/CreateClientDialog'
import EstimateActions from '../components/EstimateActions'
import EstimateCustomerAndMeta from '../components/EstimateCustomerAndMeta'
import EstimateHeaderPanel from '../components/EstimateHeaderPanel'
import EstimateItemsSection from '../components/EstimateItemsSection'
import SendEstimateEmailDialog from '../components/SendEstimateEmailDialog'
import { useEstimateEditor } from '../hooks/useEstimateEditor'

function EstimateEditorPage() {
  const {
    id,
    isNew,
    emailOpen,
    setEmailOpen,
    form,
    items,
    links,
    clients,
    projects,
    loading,
    headerOpen,
    setHeaderOpen,
    pickingCustomer,
    setPickingCustomer,
    creatingClient,
    setCreatingClient,
    error,
    saved,
    busy,
    locked,
    update,
    updateEstimateDate,
    updateItem,
    moveItem,
    addItem,
    deleteItem,
    isLumpSum,
    lineAmount,
    subtotal,
    discount,
    total,
    client,
    chooseClient,
    handleClientCreated,
    handleSave,
    handlePreview,
    handleStatusChange,
    handleConvert,
    handleDelete,
    handleDuplicate,
    applyEstimate,
  } = useEstimateEditor()

  const actions = (
    <EstimateActions
      busy={busy}
      isNew={isNew}
      locked={locked}
      status={form.status}
      id={id}
      links={links}
      onPreview={handlePreview}
      onOpenEmail={() => setEmailOpen(true)}
      onDuplicate={handleDuplicate}
      onSave={handleSave}
      onConvert={handleConvert}
      onDelete={handleDelete}
    />
  )

  if (loading) {
    return <PageLoader label="Loading estimate..." />
  }

  const availableProjects = projects.filter((p) => !p.source_estimate_id || p.id === form.project_id)

  return (
    <>
      <div className="doc-topbar">
        <PageHeader
          title={isNew ? 'New estimate' : locked ? 'Approved estimate' : 'Edit estimate'}
          description={isNew
            ? 'Choose a client, describe the work, and set the price.'
            : locked
              ? 'Review the work and prices in this approved estimate.'
              : 'Update the client, work, and prices before approval.'}
        />
        {actions}
      </div>
      {error && <p className="error-message">{error}</p>}
      {saved && <p className="doc-saved">Saved.</p>}
      {locked && (
        <p className="doc-banner">
          This estimate is approved{links.approved_at ? ` (${links.approved_at.slice(0, 10)})` : ''} and can no longer be edited.{' '}
          {links.invoice_id && <Link to={`/invoices/${links.invoice_id}`}>Invoice {links.invoice_number}</Link>}
          {links.project_id && (
            <>
              {' · '}
              <Link to={`/projects/${links.project_id}`}>Project</Link>
            </>
          )}
        </p>
      )}

      <fieldset disabled={locked} className="doc-fieldset">
        <EstimateHeaderPanel
          headerOpen={headerOpen}
          setHeaderOpen={setHeaderOpen}
          title={form.title}
          onTitleChange={(value) => update('title', value)}
          summary={form.summary}
          onSummaryChange={(value) => update('summary', value)}
        />

        {/* The estimate sheet */}
        <div className="doc-sheet">
          <EstimateCustomerAndMeta
            client={client}
            clients={clients}
            pickingCustomer={pickingCustomer}
            setPickingCustomer={setPickingCustomer}
            setCreatingClient={setCreatingClient}
            chooseClient={chooseClient}
            formClientId={form.client_id}
            contactName={form.contact_name}
            onContactNameChange={(value) => update('contact_name', value)}
            isNew={isNew}
            estimateNumber={form.estimate_number}
            onEstimateNumberChange={(value) => update('estimate_number', value)}
            customerRef={form.customer_ref}
            onCustomerRefChange={(value) => update('customer_ref', value)}
            estimateDate={form.estimate_date}
            onEstimateDateChange={updateEstimateDate}
            validUntil={form.valid_until}
            onValidUntilChange={(value) => update('valid_until', value)}
            pricingMethod={form.pricing_method}
            onPricingMethodChange={(value) => update('pricing_method', value)}
            isLumpSum={isLumpSum}
            documentLanguage={form.document_language}
            onDocumentLanguageChange={(value) => update('document_language', value)}
            projectId={form.project_id}
            onProjectIdChange={(value) => update('project_id', value)}
            availableProjects={availableProjects}
            projectLocation={form.project_location}
            onProjectLocationChange={(value) => update('project_location', value)}
            status={form.status}
            onStatusChange={handleStatusChange}
          />

          <EstimateItemsSection
            introduction={form.introduction}
            onIntroductionChange={(value) => update('introduction', value)}
            items={items}
            isLumpSum={isLumpSum}
            currency={form.currency}
            updateItem={updateItem}
            moveItem={moveItem}
            deleteItem={deleteItem}
            addItem={addItem}
            lineAmount={lineAmount}
            subtotal={subtotal}
            lumpSumFee={form.lump_sum_fee}
            onLumpSumFeeChange={(value) => update('lump_sum_fee', value)}
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

      {emailOpen && !isNew && (
        <SendEstimateEmailDialog
          estimateId={id!}
          clientEmail={client?.email ?? null}
          contactName={form.contact_name}
          projectTitle={form.summary || form.title}
          documentLanguage={form.document_language}
          onClose={() => setEmailOpen(false)}
          onSent={(updated) => applyEstimate(updated)}
        />
      )}

      {creatingClient && <CreateClientDialog onClose={() => setCreatingClient(false)} onCreated={handleClientCreated} />}
    </>
  )
}

export default EstimateEditorPage
