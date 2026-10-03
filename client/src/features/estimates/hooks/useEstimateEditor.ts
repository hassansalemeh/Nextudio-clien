import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useConfirm } from '../../../shared/components/ConfirmDialog'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { addDays, daysBetween, localDateString } from '../../../shared/lib/timeUtils'
import {
  approveEstimate,
  deleteEstimate,
  duplicateEstimate,
  fetchClientsForEstimates,
  fetchEstimate,
  fetchNextEstimateNumber,
  fetchProjectsForEstimates,
  saveEstimate,
} from '../api'
import type { Client, EstimateLinks, ItemForm, Project } from '../types'

const round2 = (n: number) => Math.round(n * 100) / 100

// New estimates are valid for 14 days by default
const DEFAULT_VALID_DAYS = 14

function emptyForm() {
  return {
    title: 'Quotation',
    summary: '',
    client_id: '',
    contact_name: '',
    customer_ref: '',
    estimate_number: '',
    estimate_date: localDateString(),
    valid_until: addDays(localDateString(), DEFAULT_VALID_DAYS),
    currency: 'USD',
    status: 'draft',
    notes: '',
    payment_terms: '',
    timeline: '',
    exclusions: '',
    discount_type: 'fixed',
    discount_value: '',
    pricing_method: 'itemized',
    lump_sum_fee: '',
    document_language: 'en',
    project_id: '',
    project_location: '',
    introduction: '',
  }
}

let nextKey = 1
const newItem = (): ItemForm => ({ key: nextKey++, name: '', description: '', quantity: '1', unit: 'sqm', unit_price: '' })

// Everything the estimate editor page needs: form state, derived totals, and every handler the page's
// sections call. Kept as one hook (rather than split further) because every piece of state here feeds the
// same save/approve/duplicate/delete workflow and the live total calculations.
export function useEstimateEditor() {
  const confirm = useConfirm()
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // /estimates/new and /estimates/:id are the same route, so saving a new estimate does not remount the editor
  const isNew = id === 'new'
  const justSavedId = useRef<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)

  const [form, setForm] = useState(emptyForm())
  const [items, setItems] = useState<ItemForm[]>([])
  const [links, setLinks] = useState<EstimateLinks>({
    invoice_id: null,
    invoice_number: null,
    project_id: null,
    approved_at: null,
  })
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [headerOpen, setHeaderOpen] = useState(true)
  const [pickingCustomer, setPickingCustomer] = useState(false)
  const [creatingClient, setCreatingClient] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  // A new estimate gets the next free number automatically; the field stays editable
  useEffect(() => {
    if (!isNew) return
    fetchNextEstimateNumber()
      .then((data) => setForm((previous) => (previous.estimate_number ? previous : { ...previous, estimate_number: data.estimate_number })))
      .catch(() => undefined)
  }, [isNew])

  useEffect(() => {
    fetchClientsForEstimates()
      .then(setClients)
      .catch(() => setError('Could not load clients.'))
    fetchProjectsForEstimates()
      .then(setProjects)
      .catch(() => setError('Could not load projects.'))
  }, [])

  // Puts a saved estimate (as returned by the server) into the editor
  function applyEstimate(estimate: any) {
    setForm({
      title: estimate.title,
      summary: estimate.summary ?? '',
      client_id: estimate.client_id ?? '',
      contact_name: estimate.contact_name ?? '',
      customer_ref: estimate.customer_ref ?? '',
      estimate_number: estimate.estimate_number,
      estimate_date: estimate.estimate_date,
      valid_until: estimate.valid_until ?? '',
      currency: estimate.currency,
      status: estimate.status,
      notes: estimate.notes ?? '',
      payment_terms: estimate.payment_terms ?? '',
      timeline: estimate.timeline ?? '',
      exclusions: estimate.exclusions ?? '',
      discount_type: estimate.discount_type,
      discount_value: Number(estimate.discount_value) ? String(Number(estimate.discount_value)) : '',
      pricing_method: estimate.pricing_method ?? 'itemized',
      lump_sum_fee: Number(estimate.lump_sum_fee) ? String(Number(estimate.lump_sum_fee)) : '',
      document_language: estimate.document_language ?? 'en',
      project_id: estimate.project_id ?? '',
      project_location: estimate.project_location ?? '',
      introduction: estimate.introduction ?? '',
    })
    setItems(
      estimate.items.map((item: any) => ({
        key: nextKey++,
        name: item.name,
        description: item.description ?? '',
        quantity: String(Number(item.quantity)),
        unit: item.unit,
        unit_price: String(Number(item.unit_price)),
      }))
    )
    setLinks({
      invoice_id: estimate.invoice_id,
      invoice_number: estimate.invoice_number,
      project_id: estimate.created_project_id ?? (estimate.status === 'approved' ? estimate.project_id : null),
      approved_at: estimate.approved_at,
    })
  }

  useEffect(() => {
    if (isNew) return
    if (justSavedId.current === id) {
      // this estimate was just saved from this editor, so its data is already on screen
      justSavedId.current = null
      return
    }
    setLoading(true)
    fetchEstimate(id!)
      .then(applyEstimate)
      .catch((err) => setError(getErrorMessage(err, 'Could not load estimate.')))
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

  const locked = !isNew && form.status === 'approved'

  const update = (field: keyof ReturnType<typeof emptyForm>, value: string) => {
    setSaved(false)
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  // Changing the estimate date shifts "Valid until" by the same number of days, so the chosen
  // duration (a preset or a custom one) stays the same instead of silently changing.
  const updateEstimateDate = (value: string) => {
    setSaved(false)
    setForm((previous) => {
      if (!previous.estimate_date || !previous.valid_until) return { ...previous, estimate_date: value }
      const duration = daysBetween(previous.estimate_date, previous.valid_until)
      return { ...previous, estimate_date: value, valid_until: addDays(value, duration) }
    })
  }

  const updateItem = (key: number, field: keyof ItemForm, value: string) => {
    setSaved(false)
    setItems((previous) => previous.map((item) => (item.key === key ? { ...item, [field]: value } : item)))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    setSaved(false)
    setItems((previous) => {
      const next = [...previous]
      const target = index + direction
      if (target < 0 || target >= next.length) return previous
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const addItem = () => {
    setSaved(false)
    setItems((previous) => [...previous, newItem()])
  }

  const deleteItem = (key: number) => {
    setSaved(false)
    setItems((previous) => previous.filter((row) => row.key !== key))
  }

  // Live numbers while typing. The server recalculates the same totals when saving, and rejects anything inconsistent.
  const isLumpSum = form.pricing_method === 'lump_sum'
  const lineAmount = (item: ItemForm) => round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))
  const itemsSubtotal = round2(items.reduce((sum, item) => sum + lineAmount(item), 0))
  // Lump Sum: the subtotal is only the lump sum fee - item quantity/unit price never feed it, even if a row still has them internally.
  const subtotal = isLumpSum ? round2(Number(form.lump_sum_fee) || 0) : itemsSubtotal
  const discountValue = Number(form.discount_value) || 0
  const discount = form.discount_type === 'percent' ? round2((subtotal * discountValue) / 100) : discountValue
  const total = round2(subtotal - discount)

  const client = clients.find((c) => c.id === form.client_id)

  function chooseClient(clientId: string) {
    const chosen = clients.find((c) => c.id === clientId)
    setSaved(false)
    // Pre-fill the contact person from the client record; it can still be edited
    setForm((previous) => ({ ...previous, client_id: clientId, contact_name: chosen?.contact_name ?? '' }))
    setPickingCustomer(false)
  }

  // Created from the "+ New Client" modal without leaving the estimate: add it to the picker and select it
  // immediately. Everything else already typed into the estimate (items, terms, etc.) is untouched.
  function handleClientCreated(newClient: Client) {
    setClients((previous) => [newClient, ...previous])
    setSaved(false)
    setForm((previous) => ({ ...previous, client_id: newClient.id, contact_name: newClient.contact_name ?? '' }))
    setPickingCustomer(false)
    setCreatingClient(false)
  }

  // Saves the estimate; returns the saved estimate, or null when something is wrong (the error is shown)
  async function save(): Promise<any | null> {
    setError('')
    setSaved(false)

    if (!form.estimate_date) return setError('Estimate date is required.'), null
    if (form.valid_until && form.valid_until < form.estimate_date) {
      return setError('Valid until cannot be before the estimate date.'), null
    }
    for (const [index, item] of items.entries()) {
      if (!item.name.trim()) return setError(`Item ${index + 1}: enter the service name.`), null
      // Quantity/unit price aren't shown or required in Lump Sum mode; whatever is already stored is kept as-is.
      if (isLumpSum) continue
      if (!(Number(item.quantity) > 0)) return setError(`Item ${index + 1}: quantity must be greater than 0.`), null
      if (item.unit_price === '' || Number(item.unit_price) < 0) return setError(`Item ${index + 1}: enter the unit price.`), null
    }
    if (isLumpSum && (form.lump_sum_fee === '' || Number(form.lump_sum_fee) < 0)) {
      return setError('Enter the Lump Sum Fee.'), null
    }
    if (form.discount_type === 'percent' && discountValue > 100) return setError('A percentage discount cannot be more than 100%.'), null
    if (discount > subtotal) return setError('The discount cannot be more than the subtotal.'), null

    try {
      const estimate = await saveEstimate(id, isNew, {
        ...form,
        client_id: form.client_id || null,
        project_id: form.project_id || null,
        valid_until: form.valid_until || null,
        discount_value: discountValue,
        lump_sum_fee: Number(form.lump_sum_fee) || 0,
        items: items.map((item) => ({
          name: item.name,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          unit_price: Number(item.unit_price),
        })),
      })
      applyEstimate(estimate)
      setSaved(true)
      if (isNew) {
        justSavedId.current = String(estimate.id)
        navigate(`/estimates/${estimate.id}`, { replace: true })
      }
      return estimate
    } catch (err) {
      const message = getErrorMessage(err, 'Could not save estimate.')
      setError(message)
      toast.error(message)
      return null
    }
  }

  async function handleSave() {
    setBusy(true)
    const estimate = await save()
    setBusy(false)
    if (estimate) toast.success('Estimate saved.')
  }

  async function handlePreview() {
    setBusy(true)
    const estimate = await save()
    setBusy(false)
    if (estimate) navigate(`/estimates/${estimate.id}/preview`)
  }

  // Saves the current edits, then approves: creates the invoice and the project. Returns the approved estimate or null.
  async function approve(): Promise<any | null> {
    if (isNew) return setError('Save the estimate first, then convert it.'), null
    const ok = await confirm({
      title: 'Approve this estimate?',
      message: 'Approve this estimate and create its Invoice and Project?',
      confirmLabel: 'Approve & create invoice',
    })
    if (!ok) return null

    setBusy(true)
    let approved: any | null = null
    const estimate = await save()
    if (estimate) {
      try {
        const body = await approveEstimate(estimate.id)
        applyEstimate(body)
        setSaved(false)
        approved = body
        toast.success('Estimate approved.')
      } catch (err) {
        const message = getErrorMessage(err, 'Could not approve the estimate.')
        setError(message)
        toast.error(message)
      }
    }
    setBusy(false)
    return approved
  }

  async function handleStatusChange(value: string) {
    if (value !== 'approved') return update('status', value)
    await approve()
  }

  // The client approved the quotation: create the invoice and open it
  async function handleConvert() {
    const approved = await approve()
    if (approved?.invoice_id) navigate(`/invoices/${approved.invoice_id}`)
  }

  // Permanently removes the estimate. The server blocks this (409) if it was already converted to an
  // invoice/project instead of silently cascading - the error message is shown as-is.
  async function handleDelete() {
    setError('')
    const ok = await confirm({
      title: `Delete estimate ${form.estimate_number}?`,
      message: `This will permanently delete estimate ${form.estimate_number}${client ? ` for ${client.name}` : ''}. This cannot be undone.`,
      confirmLabel: 'Delete estimate',
      tone: 'danger',
      onConfirm: async () => {
        await deleteEstimate(id!)
      },
    })
    if (!ok) return
    toast.success('Estimate deleted.')
    navigate('/estimates')
  }

  // A brand-new estimate that starts from this one's content - the original is left completely unchanged
  async function handleDuplicate() {
    setBusy(true)
    setError('')
    try {
      const body = await duplicateEstimate(id!)
      toast.success('Estimate duplicated.')
      navigate(`/estimates/${body.id}`)
    } catch (err) {
      const message = getErrorMessage(err, 'Could not duplicate the estimate.')
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return {
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
  }
}
