import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../../../shared/components/PageHeader'
import { MailIcon, PencilIcon } from '../../../shared/components/icons'
import PageLoader from '../../../shared/components/PageLoader'
import InvoiceContractCard from '../components/InvoiceContractCard'
import InvoiceDetailsCard from '../components/InvoiceDetailsCard'
import InvoiceDisbursementsCard from '../components/InvoiceDisbursementsCard'
import InvoiceItemsCard from '../components/InvoiceItemsCard'
import InvoicePaymentsCard from '../components/InvoicePaymentsCard'
import SendInvoiceEmailDialog from '../components/SendInvoiceEmailDialog'
import { useInvoiceDetail } from '../hooks/useInvoiceDetail'

function InvoiceDetailPage() {
  const navigate = useNavigate()
  const {
    invoice,
    error,
    emailOpen,
    setEmailOpen,
    load,
    paymentDate,
    setPaymentDate,
    amount,
    setAmount,
    method,
    setMethod,
    reason,
    setReason,
    reference,
    setReference,
    paymentError,
    saving,
    recordPayment,
    disbursements,
    dDate,
    setDDate,
    dPayee,
    setDPayee,
    dDescription,
    setDDescription,
    dCategory,
    setDCategory,
    dAmount,
    setDAmount,
    dReference,
    setDReference,
    dError,
    dSaving,
    addDisbursement,
    deleteDisbursement,
    contractEditing,
    setContractEditing,
    contractTerms,
    setContractTerms,
    clientRepName,
    setClientRepName,
    clientRepTitle,
    setClientRepTitle,
    nextudioRepName,
    setNextudioRepName,
    nextudioRepTitle,
    setNextudioRepTitle,
    contractError,
    contractSaving,
    startContractEdit,
    saveContract,
  } = useInvoiceDetail()

  if (error) {
    return (
      <>
        <p>
          <Link to="/invoices">← Back to Invoices</Link>
        </p>
        <p className="error-message">{error}</p>
      </>
    )
  }
  if (!invoice) return <PageLoader label="Loading invoice..." />

  const money = (value: number | string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(Number(value))
  const hasDiscount = Number(invoice.discount) > 0
  const isClientFunds = invoice.invoice_type === 'client_funds'
  const isLumpSum = invoice.pricing_method === 'lump_sum'
  const fundsSpent = disbursements.reduce((total, d) => total + Number(d.amount), 0)

  return (
    <>
      <div className="doc-topbar">
        <PageHeader
          title={`${isClientFunds ? 'Client Funds Invoice' : 'Invoice'} ${invoice.invoice_number}`}
          description={isClientFunds
            ? 'See client money received, spent, and still available.'
            : 'Review what was billed, paid, and still due on this invoice.'}
        />
        <div className="doc-actions">
          <button type="button" className="btn-outline" onClick={() => navigate('/invoices')}>
            Back
          </button>
          {isClientFunds && invoice.paid === 0 && (
            <button type="button" className="btn-outline" onClick={() => navigate(`/invoices/${invoice.id}/edit`)}>
              <PencilIcon /> Edit
            </button>
          )}
          <button type="button" className="btn-outline" onClick={() => setEmailOpen(true)}>
            <MailIcon /> Send by Email
          </button>
          <button type="button" className="btn-pill" onClick={() => navigate(`/invoices/${invoice.id}/preview`)}>
            Preview / PDF
          </button>
        </div>
      </div>

      <InvoiceDetailsCard invoice={invoice} isClientFunds={isClientFunds} />

      <InvoiceItemsCard invoice={invoice} isClientFunds={isClientFunds} isLumpSum={isLumpSum} hasDiscount={hasDiscount} money={money} />

      {!isClientFunds && (
        <InvoiceContractCard
          invoice={invoice}
          contractEditing={contractEditing}
          contractTerms={contractTerms}
          setContractTerms={setContractTerms}
          clientRepName={clientRepName}
          setClientRepName={setClientRepName}
          clientRepTitle={clientRepTitle}
          setClientRepTitle={setClientRepTitle}
          nextudioRepName={nextudioRepName}
          setNextudioRepName={setNextudioRepName}
          nextudioRepTitle={nextudioRepTitle}
          setNextudioRepTitle={setNextudioRepTitle}
          contractError={contractError}
          contractSaving={contractSaving}
          startContractEdit={startContractEdit}
          saveContract={saveContract}
          setContractEditing={setContractEditing}
        />
      )}

      <InvoicePaymentsCard
        invoice={invoice}
        money={money}
        paymentDate={paymentDate}
        setPaymentDate={setPaymentDate}
        amount={amount}
        setAmount={setAmount}
        method={method}
        setMethod={setMethod}
        reason={reason}
        setReason={setReason}
        reference={reference}
        setReference={setReference}
        paymentError={paymentError}
        saving={saving}
        recordPayment={recordPayment}
      />

      {isClientFunds && (
        <InvoiceDisbursementsCard
          invoice={invoice}
          disbursements={disbursements}
          money={money}
          fundsSpent={fundsSpent}
          dDate={dDate}
          setDDate={setDDate}
          dPayee={dPayee}
          setDPayee={setDPayee}
          dDescription={dDescription}
          setDDescription={setDDescription}
          dCategory={dCategory}
          setDCategory={setDCategory}
          dAmount={dAmount}
          setDAmount={setDAmount}
          dReference={dReference}
          setDReference={setDReference}
          dError={dError}
          dSaving={dSaving}
          addDisbursement={addDisbursement}
          deleteDisbursement={deleteDisbursement}
        />
      )}

      {emailOpen && (
        <SendInvoiceEmailDialog
          invoiceId={invoice.id}
          invoiceType={invoice.invoice_type}
          clientEmail={invoice.client_email}
          contactName={invoice.contact_name ?? ''}
          projectTitle={invoice.summary || invoice.title}
          documentLanguage={invoice.document_language}
          onClose={() => setEmailOpen(false)}
          onSent={() => load()}
        />
      )}
    </>
  )
}

export default InvoiceDetailPage
