import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { localDateString } from '../../../shared/lib/timeUtils'
import { fetchClientsForReceipts, fetchNextReceiptNumber, fetchProjectsForReceipts, fetchReceipt, saveReceipt } from '../api'
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
    issued_by_admin: '',
    document_language: 'en',
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

  const [form, setForm] = useState(emptyForm())
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
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

  useEffect(() => {
    fetchClientsForReceipts()
      .then(setClients)
      .catch(() => setError('Could not load clients.'))
    fetchProjectsForReceipts()
      .then(setProjects)
      .catch(() => setError('Could not load projects.'))
  }, [])

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
      issued_by_admin: receipt.issued_by_admin,
      document_language: receipt.document_language ?? 'en',
    })
  }

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

    if (!form.receipt_date) return setError('Receipt date is required.'), null
    if (!form.receiver_name.trim()) return setError("Enter the receiver's name."), null
    if (!(Number(form.amount) > 0)) return setError('Enter an amount greater than 0.'), null
    if (!form.reason.trim()) return setError('Enter the reason for the payment.'), null
    if (!form.issued_by_admin) return setError('Choose the issuing admin.'), null

    try {
      const receipt = await saveReceipt(id, isNew, {
        ...form,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        receiver_email: form.receiver_email || null,
        amount: Number(form.amount),
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
    setBusy(true)
    const receipt = await save()
    setBusy(false)
    if (receipt) navigate(`/receipts/${receipt.id}/preview`)
  }

  return {
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
  }
}
