import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../../../shared/components/Toast'
import { getErrorMessage } from '../../../shared/lib/apiError'
import { addDays, daysBetween, localDateString } from '../../../shared/lib/timeUtils'
import { fetchClientsForInvoices, fetchInvoice, fetchNextClientFundsInvoiceNumber, fetchProjectsForInvoices, saveClientFundsInvoice } from '../api'
import type { ClientFundsClient, ClientFundsItemForm, ClientFundsProject } from '../types'

const round2 = (n: number) => Math.round(n * 100) / 100

// New Client Funds invoices are due 14 days out by default, matching the estimate "Valid until" default
const DEFAULT_DUE_DAYS = 14

function emptyForm() {
  return {
    title: 'Client Funds / Project Expenses',
    summary: '',
    client_id: '',
    contact_name: '',
    customer_ref: '',
    invoice_number: '',
    invoice_date: localDateString(),
    due_date: addDays(localDateString(), DEFAULT_DUE_DAYS),
    currency: 'USD',
    notes: '',
    payment_terms: '',
    timeline: '',
    exclusions: '',
    discount_type: 'fixed',
    discount_value: '',
    project_id: '',
    project_location: '',
    introduction: '',
  }
}

let nextKey = 1
const newItem = (): ClientFundsItemForm => ({ key: nextKey++, name: '', description: '', quantity: '1', unit: 'ls', unit_price: '' })

// Everything the Client Funds invoice editor page needs: form state, derived totals, and every handler the
// page's sections call. Kept as one hook so the page itself stays presentational.
export function useClientFundsInvoiceEditor() {
  const toast = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [form, setForm] = useState(emptyForm())
  const [items, setItems] = useState<ClientFundsItemForm[]>([newItem()])
  const [clients, setClients] = useState<ClientFundsClient[]>([])
  const [projects, setProjects] = useState<ClientFundsProject[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [notClientFunds, setNotClientFunds] = useState(false)
  const [locked, setLocked] = useState(false)
  const [pickingCustomer, setPickingCustomer] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isNew) return
    fetchNextClientFundsInvoiceNumber()
      .then((data) => setForm((previous) => (previous.invoice_number ? previous : { ...previous, invoice_number: data.invoice_number })))
      .catch(() => undefined)
  }, [isNew])

  useEffect(() => {
    fetchClientsForInvoices()
      .then(setClients)
      .catch((err) => setError(getErrorMessage(err, 'Could not load clients.')))
    fetchProjectsForInvoices()
      .then(setProjects)
      .catch((err) => setError(getErrorMessage(err, 'Could not load projects.')))
  }, [])

  function applyInvoice(invoice: any) {
    if (invoice.invoice_type !== 'client_funds') {
      setNotClientFunds(true)
      return
    }
    setForm({
      title: invoice.title,
      summary: invoice.summary ?? '',
      client_id: invoice.client_id ?? '',
      contact_name: invoice.contact_name ?? '',
      customer_ref: invoice.customer_ref ?? '',
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date ?? '',
      currency: invoice.currency,
      notes: invoice.notes ?? '',
      payment_terms: invoice.payment_terms ?? '',
      timeline: invoice.timeline ?? '',
      exclusions: invoice.exclusions ?? '',
      discount_type: invoice.discount_type,
      discount_value: Number(invoice.discount_value) ? String(Number(invoice.discount_value)) : '',
      project_id: invoice.project_id ?? '',
      project_location: invoice.project_location ?? '',
      introduction: invoice.introduction ?? '',
    })
    setItems(
      invoice.items.map((item: any) => ({
        key: nextKey++,
        name: item.name,
        description: item.description ?? '',
        quantity: String(Number(item.quantity)),
        unit: item.unit,
        unit_price: String(Number(item.unit_price)),
      }))
    )
    setLocked(invoice.paid > 0)
  }

  useEffect(() => {
    if (isNew || !id) return
    setLoading(true)
    fetchInvoice(id)
      .then(applyInvoice)
      .catch((err) => setError(getErrorMessage(err, 'Could not load invoice.')))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const update = (field: keyof ReturnType<typeof emptyForm>, value: string) => {
    setSaved(false)
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  // Changing the invoice date shifts the payment due date by the same number of days, so the chosen
  // duration (a preset or a custom one) stays the same instead of silently changing.
  const updateInvoiceDate = (value: string) => {
    setSaved(false)
    setForm((previous) => {
      if (!previous.invoice_date || !previous.due_date) return { ...previous, invoice_date: value }
      const duration = daysBetween(previous.invoice_date, previous.due_date)
      return { ...previous, invoice_date: value, due_date: addDays(value, duration) }
    })
  }

  const updateItem = (key: number, field: keyof ClientFundsItemForm, value: string) => {
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

  const lineAmount = (item: ClientFundsItemForm) => round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))
  const subtotal = round2(items.reduce((sum, item) => sum + lineAmount(item), 0))
  const discountValue = Number(form.discount_value) || 0
  const discount = form.discount_type === 'percent' ? round2((subtotal * discountValue) / 100) : discountValue
  const total = round2(subtotal - discount)

  const client = clients.find((c) => c.id === form.client_id)
  const clientProjects = projects.filter((p) => !form.client_id || p.client_id === form.client_id)

  function chooseClient(clientId: string) {
    const chosen = clients.find((c) => c.id === clientId)
    setSaved(false)
    setForm((previous) => ({
      ...previous,
      client_id: clientId,
      contact_name: chosen?.contact_name ?? '',
      // the previously chosen project may not belong to the new client
      project_id: projects.find((p) => p.id === previous.project_id)?.client_id === clientId ? previous.project_id : '',
    }))
    setPickingCustomer(false)
  }

  function chooseProject(projectId: string) {
    const project = projects.find((p) => p.id === projectId)
    setSaved(false)
    setForm((previous) => ({
      ...previous,
      project_id: projectId,
      // prefill from the project, but never overwrite something already typed in
      project_location: previous.project_location || project?.location || '',
    }))
  }

  async function save(): Promise<any | null> {
    setError('')
    setSaved(false)

    if (!form.client_id) return setError('Choose a client.'), null
    if (!form.project_id) return setError('Choose the project these funds are for.'), null
    if (!form.invoice_date) return setError('Invoice date is required.'), null
    if (form.due_date && form.due_date < form.invoice_date) return setError('Payment due date cannot be before the invoice date.'), null
    for (const [index, item] of items.entries()) {
      if (!item.name.trim()) return setError(`Item ${index + 1}: enter a description.`), null
      if (!(Number(item.quantity) > 0)) return setError(`Item ${index + 1}: quantity must be greater than 0.`), null
      if (item.unit_price === '' || Number(item.unit_price) < 0) return setError(`Item ${index + 1}: enter the unit price.`), null
    }
    if (form.discount_type === 'percent' && discountValue > 100) return setError('A percentage discount cannot be more than 100%.'), null
    if (discount > subtotal) return setError('The discount cannot be more than the subtotal.'), null

    try {
      const invoice = await saveClientFundsInvoice(id, isNew, {
        ...form,
        invoice_type: 'client_funds',
        due_date: form.due_date || null,
        discount_value: discountValue,
        items: items.map((item) => ({
          name: item.name,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          unit_price: Number(item.unit_price),
        })),
      })
      setSaved(true)
      if (isNew) {
        navigate(`/invoices/${invoice.id}/edit`, { replace: true })
      }
      return invoice
    } catch (err) {
      const message = getErrorMessage(err, 'Could not save the invoice.')
      setError(message)
      toast.error(message)
      return null
    }
  }

  async function handleSave() {
    setBusy(true)
    const invoice = await save()
    setBusy(false)
    if (invoice) toast.success('Invoice saved.')
  }

  async function handlePreview() {
    setBusy(true)
    const invoice = await save()
    setBusy(false)
    if (invoice) navigate(`/invoices/${invoice.id}/preview`)
  }

  return {
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
  }
}
