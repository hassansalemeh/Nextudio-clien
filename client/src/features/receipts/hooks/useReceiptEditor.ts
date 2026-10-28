import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { localDateString } from '../../../shared/lib/timeUtils'
import { fetchSigners } from '../../signatures-and-stamps/document-signers-api'
import type { DocumentSigner } from '../../signatures-and-stamps/document-signers-api'
import { cancelReceipt, fetchClientsForReceipts, fetchNextReceiptNumber, fetchPaymentForReceipt, fetchProjectsForReceipts, fetchReceipt, saveReceipt } from '../api'
import type { Client, Project } from '../types'

function emptyForm() {
  return {
    receipt_number: '',
    receipt_date: localDateString(),
    client_id: '',
    project_id: '',
    receiver_name: '',
    receiver_email: '',
    amount: '',
    currency: 'USD',
    reason: '',
    issued_by_signer_id: '',
    received_by_signer_id: '',
    show_paid_stamp: true,
    show_company_stamp: true,
    document_language: 'en',
    payment_id: '',
  }
}

// Everything the receipt editor page needs: form state and the handlers the page's sections call.
// Much simpler than the estimate editor's hook - a receipt has no line items, totals, or approval workflow.
export function useReceiptEditor() {
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // /receipts/new and /receipts/:id are the same route, so saving a new receipt does not remount the editor
  const isNew = id === 'new'
  const justSavedId = useRef<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)

  // Set only when creating a new receipt from the Payments page's "Create receipt" action - the receipt
  // links to this existing payment instead of creating a new one, and its amount/date/project are locked.
  const linkedPaymentId = isNew ? searchParams.get('payment_id') : null

  const [form, setForm] = useState(emptyForm())
  const [linkedPayment, setLinkedPayment] = useState<any | null>(null)
  const [cancelledAt, setCancelledAt] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [signers, setSigners] = useState<DocumentSigner[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [pickingCustomer, setPickingCustomer] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  // A new receipt gets the next free number automatically; the field stays editable
  useEffect(() => {
    if (!isNew) return
    fetchNextReceiptNumber()
      .then((data) => setForm((previous) => (previous.receipt_number ? previous : { ...previous, receipt_number: data.receipt_number })))
      .catch(() => undefined)
  }, [isNew])

  // Prefills (and locks) amount/date/project from the payment being linked
  useEffect(() => {
    if (!linkedPaymentId) return
    fetchPaymentForReceipt(linkedPaymentId)
      .then((payment) => {
        setLinkedPayment(payment)
        setForm((previous) => ({
          ...previous,
          payment_id: String(payment.id),
          project_id: String(payment.project_id),
          receipt_date: payment.payment_date,
          amount: String(Number(payment.amount)),
          receiver_name: previous.receiver_name || payment.client_name || '',
        }))
      })
      .catch(() => setError('Could not load the payment to link.'))
  }, [linkedPaymentId])

  useEffect(() => {
    fetchClientsForReceipts()
      .then(setClients)
      .catch(() => setError('Could not load clients.'))
    fetchProjectsForReceipts()
      .then(setProjects)
      .catch(() => setError('Could not load projects.'))
    fetchSigners()
      .then(setSigners)
      .catch(() => setError('Could not load signers.'))
  }, [])

  // Only active signers can be freshly chosen - but a signer already selected on this receipt (even if
  // deactivated since) still needs to appear, so the dropdown doesn't go blank on a receipt that already
  // names them.
  const signerOptions = (() => {
    const selectedIds = new Set([form.issued_by_signer_id, form.received_by_signer_id].filter(Boolean))
    const alreadySelectedInactive = signers.filter((signer) => !signer.is_active && selectedIds.has(signer.id))
    return [...signers.filter((signer) => signer.is_active), ...alreadySelectedInactive]
  })()

  // Puts a saved receipt (as returned by the server) into the editor
  function applyReceipt(receipt: any) {
    setForm({
      receipt_number: receipt.receipt_number,
      receipt_date: receipt.receipt_date,
      client_id: receipt.client_id ?? '',
      project_id: receipt.project_id ?? '',
      receiver_name: receipt.receiver_name,
      receiver_email: receipt.receiver_email ?? '',
      amount: Number(receipt.amount) ? String(Number(receipt.amount)) : '',
      currency: receipt.currency,
      reason: receipt.reason,
      issued_by_signer_id: receipt.issued_by_signer_id ?? '',
      received_by_signer_id: receipt.received_by_signer_id ?? '',
      show_paid_stamp: receipt.show_paid_stamp ?? true,
      show_company_stamp: receipt.show_company_stamp ?? true,
      document_language: receipt.document_language ?? 'en',
      payment_id: receipt.payment_id ?? '',
    })
    setCancelledAt(receipt.cancelled_at ?? null)
    setCancelReason(receipt.cancel_reason ?? null)
  }

  // True once a receipt is linked to a payment (either just now, or already saved that way) - amount,
  // date and project are then sourced from the payment and can't be edited here.
  const moneyLocked = Boolean(form.payment_id)
  const cancelled = Boolean(cancelledAt)

  useEffect(() => {
    if (isNew) return
    if (justSavedId.current === id) {
      // this receipt was just saved from this editor, so its data is already on screen
      justSavedId.current = null
      return
    }
    setLoading(true)
    fetchReceipt(id!)
      .then(applyReceipt)
      .catch((err) => setError(getErrorMessage(err, 'Could not load receipt.')))
      .finally(() => setLoading(false))
  }, [id, isNew])

  // The Preview page's "Send by Email" button links here with ?send=1 so the dialog opens automatically
  useEffect(() => {
    if (isNew || loading) return
    if (searchParams.get('send') === '1') {
      setEmailOpen(true)
      searchParams.delete('send')
      setSearchParams(searchParams, { replace: true })
    }
  }, [isNew, loading, searchParams, setSearchParams])

  const update = (field: keyof ReturnType<typeof emptyForm>, value: string) => {
    setSaved(false)
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  const toggleShowPaidStamp = (value: boolean) => {
    setSaved(false)
    setForm((previous) => ({ ...previous, show_paid_stamp: value }))
  }

  const toggleShowCompanyStamp = (value: boolean) => {
    setSaved(false)
    setForm((previous) => ({ ...previous, show_company_stamp: value }))
  }

  const client = clients.find((c) => c.id === form.client_id)

  // Picking a client only prefills the receiver's name/email if they're still empty - it never
  // overwrites something the admin already typed by hand.
  function chooseClient(clientId: string) {
    const chosen = clients.find((c) => c.id === clientId)
    setSaved(false)
    setForm((previous) => ({
      ...previous,
      client_id: clientId,
      receiver_name: previous.receiver_name || chosen?.contact_name || chosen?.name || '',
      receiver_email: previous.receiver_email || chosen?.email || '',
    }))
    setPickingCustomer(false)
  }

  // Saves the receipt; returns the saved receipt, or null when something is wrong (the error is shown)
  async function save(): Promise<any | null> {
    setError('')
    setSaved(false)

    if (cancelled) return setError('This receipt is cancelled and can no longer be edited.'), null
    if (!form.receipt_date) return setError('Receipt date is required.'), null
    if (!form.receiver_name.trim()) return setError('Enter who the payment was received from.'), null
    if (!(Number(form.amount) > 0)) return setError('Enter an amount greater than 0.'), null
    if (!form.reason.trim()) return setError('Enter the reason for the payment.'), null
    if (form.reason.trim().length > 200) return setError('The reason is too long (200 characters at most).'), null
    if (!form.issued_by_signer_id) return setError('Choose the issuing signer.'), null
    if (!form.received_by_signer_id) return setError('Choose the receiving signer.'), null
    if (isNew && !form.payment_id && !form.project_id) return setError('Choose a project.'), null

    try {
      const receipt = await saveReceipt(id, isNew, {
        ...form,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        receiver_email: form.receiver_email || null,
        amount: Number(form.amount),
        // Only a new receipt sends payment_id (to link it); an existing receipt's link can't change.
        payment_id: isNew ? form.payment_id || null : undefined,
      })
      applyReceipt(receipt)
      setSaved(true)
      if (isNew) {
        justSavedId.current = String(receipt.id)
        navigate(`/receipts/${receipt.id}`, { replace: true })
      }
      return receipt
    } catch (err) {
      const message = getErrorMessage(err, 'Could not save receipt.')
      setError(message)
      toast.error(message)
      return null
    }
  }

  async function handleSave() {
    setBusy(true)
    const receipt = await save()
    setBusy(false)
    if (receipt) toast.success('Receipt saved.')
  }

  async function handlePreview() {
    // A cancelled receipt can't be saved (nothing to save - it's unchanged), but its PDF, with the
    // CANCELLED mark, must still be viewable.
    if (cancelled) return navigate(`/receipts/${id}/preview`)
    setBusy(true)
    const receipt = await save()
    setBusy(false)
    if (receipt) navigate(`/receipts/${receipt.id}/preview`)
  }

  // Cancels this receipt AND its linked payment together. Never deletes either.
  async function handleCancel(reason: string) {
    const receipt = await cancelReceipt(id!, reason)
    applyReceipt(receipt)
    setCancelOpen(false)
    toast.success('Receipt cancelled.')
  }

  return {
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
  }
}
