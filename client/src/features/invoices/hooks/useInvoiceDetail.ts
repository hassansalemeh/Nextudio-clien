import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { localDateString } from '../../../shared/lib/timeUtils'
import {
  addInvoiceDisbursement,
  deleteInvoiceDisbursement,
  fetchInvoice,
  fetchInvoiceDisbursements,
  recordInvoicePayment,
  saveInvoiceContract,
} from '../api'
import type { Disbursement, InvoiceDetail } from '../types'

// Everything the invoice detail page needs: the invoice itself, its disbursements, and every form/handler
// its cards (payments, disbursements, contract) call.
export function useInvoiceDetail() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [error, setError] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)

  const [paymentDate, setPaymentDate] = useState(localDateString())
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [reason, setReason] = useState('Payment')
  const [reference, setReference] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [saving, setSaving] = useState(false)

  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [dDate, setDDate] = useState(localDateString())
  const [dPayee, setDPayee] = useState('')
  const [dDescription, setDDescription] = useState('')
  const [dCategory, setDCategory] = useState('')
  const [dAmount, setDAmount] = useState('')
  const [dReference, setDReference] = useState('')
  const [dError, setDError] = useState('')
  const [dSaving, setDSaving] = useState(false)

  const [contractEditing, setContractEditing] = useState(false)
  const [contractTerms, setContractTerms] = useState('')
  const [clientRepName, setClientRepName] = useState('')
  const [clientRepTitle, setClientRepTitle] = useState('')
  const [nextudioRepName, setNextudioRepName] = useState('')
  const [nextudioRepTitle, setNextudioRepTitle] = useState('')
  const [contractError, setContractError] = useState('')
  const [contractSaving, setContractSaving] = useState(false)

  const load = useCallback(() => {
    fetchInvoice(id!)
      .then((data) => {
        setInvoice(data)
        setError('')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load invoice.'))
  }, [id])

  const loadDisbursements = useCallback(() => {
    fetchInvoiceDisbursements(id!)
      .then(setDisbursements)
      .catch(() => undefined)
  }, [id])

  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  useEffect(() => {
    if (invoice?.invoice_type === 'client_funds') loadDisbursements()
  }, [invoice?.invoice_type, loadDisbursements])

  // Opened via /invoices/:id?send=1 (e.g. from the PDF preview's "Send by Email" shortcut)
  useEffect(() => {
    if (!invoice) return
    if (searchParams.get('send') === '1') {
      setEmailOpen(true)
      searchParams.delete('send')
      setSearchParams(searchParams, { replace: true })
    }
  }, [invoice, searchParams, setSearchParams])

  async function recordPayment(event: React.FormEvent) {
    event.preventDefault()
    setPaymentError('')
    const value = Number(amount)
    if (!paymentDate) return setPaymentError('Payment date is required.')
    if (amount === '' || Number.isNaN(value) || value <= 0) return setPaymentError('Enter a payment amount greater than 0.')
    if (!reason.trim()) return setPaymentError('Enter a reason for the payment.')
    if (!invoice?.project_id) return setPaymentError('This invoice is not linked to a project yet.')

    setSaving(true)
    try {
      // the same payment record the Payments page creates: it belongs to the project and is applied to this invoice
      await recordInvoicePayment({
        project_id: invoice.project_id,
        invoice_id: invoice.id,
        payment_date: paymentDate,
        amount: value,
        reason,
        method: method || null,
        reference,
      })
      load()
      setAmount('')
      setReference('')
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Could not record the payment.')
    } finally {
      setSaving(false)
    }
  }

  async function addDisbursement(event: React.FormEvent) {
    event.preventDefault()
    setDError('')
    const value = Number(dAmount)
    if (!dDate) return setDError('Date is required.')
    if (!dPayee.trim()) return setDError('Enter who the money was paid to.')
    if (dAmount === '' || Number.isNaN(value) || value <= 0) return setDError('Enter an amount greater than 0.')

    setDSaving(true)
    try {
      await addInvoiceDisbursement(id!, {
        disbursement_date: dDate,
        payee: dPayee,
        description: dDescription || null,
        category: dCategory || null,
        amount: value,
        reference: dReference || null,
      })
      loadDisbursements()
      setDPayee('')
      setDDescription('')
      setDCategory('')
      setDAmount('')
      setDReference('')
    } catch (err) {
      setDError(err instanceof Error ? err.message : 'Could not record the disbursement.')
    } finally {
      setDSaving(false)
    }
  }

  async function deleteDisbursement(disbursementId: string) {
    try {
      await deleteInvoiceDisbursement(id!, disbursementId)
      loadDisbursements()
    } catch {
      setDError('Could not delete the disbursement.')
    }
  }

  function startContractEdit() {
    if (!invoice) return
    setContractError('')
    setContractTerms(invoice.contract_terms ?? '')
    setClientRepName(invoice.client_representative_name ?? '')
    setClientRepTitle(invoice.client_representative_title ?? '')
    setNextudioRepName(invoice.nextudio_representative_name ?? '')
    setNextudioRepTitle(invoice.nextudio_representative_title ?? '')
    setContractEditing(true)
  }

  // Only the contract/signatures fields change here - every financial field on the invoice stays frozen
  async function saveContract() {
    setContractError('')
    setContractSaving(true)
    try {
      const updated = await saveInvoiceContract(id!, {
        contract_terms: contractTerms,
        client_representative_name: clientRepName,
        client_representative_title: clientRepTitle,
        nextudio_representative_name: nextudioRepName,
        nextudio_representative_title: nextudioRepTitle,
      })
      setInvoice(updated)
      setContractEditing(false)
    } catch (err) {
      setContractError(err instanceof Error ? err.message : 'Could not save the contract.')
    } finally {
      setContractSaving(false)
    }
  }

  return {
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
  }
}
