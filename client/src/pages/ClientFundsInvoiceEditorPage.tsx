import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { COMPANY } from '../companyProfile'
import { localDateString } from '../timeUtils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Client = { id: string; name: string; contact_name: string | null; email: string | null }
type Project = { id: string; client_id: string; name: string; location: string | null }

type ItemForm = {
  key: number
  name: string
  description: string
  quantity: string
  unit: string
  unit_price: string
}

const UNITS = [
  { value: 'sqm', label: 'sqm' },
  { value: 'lm', label: 'lm' },
  { value: 'ls', label: 'ls' },
  { value: 'pc', label: 'pc' },
  { value: 'm3', label: 'm³' },
  { value: 'sheet', label: 'sheet' },
]

const CURRENCIES = [
  { value: 'USD', label: 'USD ($) - United States dollar' },
  { value: 'EUR', label: 'EUR (€) - Euro' },
  { value: 'GBP', label: 'GBP (£) - British pound' },
  { value: 'LBP', label: 'LBP - Lebanese pound' },
]

const TERMS_SECTIONS: { field: 'payment_terms' | 'timeline' | 'notes' | 'exclusions'; label: string; placeholder: string; tall?: boolean }[] = [
  { field: 'payment_terms', label: 'Payment Terms', placeholder: 'e.g. Funds are held for project expenses and disbursed as needed...' },
  { field: 'timeline', label: 'Timeline', placeholder: 'e.g. Expected disbursement schedule...' },
  { field: 'notes', label: 'Notes', placeholder: 'General notes for the client...' },
  { field: 'exclusions', label: 'Exclusions', placeholder: 'What is not covered by these funds...', tall: true },
]

const round2 = (n: number) => Math.round(n * 100) / 100

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function emptyForm() {
  return {
    title: 'Client Funds / Project Expenses',
    summary: '',
    client_id: '',
    contact_name: '',
    customer_ref: '',
    invoice_number: '',
    invoice_date: localDateString(),
    due_date: '',
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
const newItem = (): ItemForm => ({ key: nextKey++, name: '', description: '', quantity: '1', unit: 'ls', unit_price: '' })

function ClientFundsInvoiceEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [form, setForm] = useState(emptyForm())
  const [items, setItems] = useState<ItemForm[]>([newItem()])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [notClientFunds, setNotClientFunds] = useState(false)
  const [locked, setLocked] = useState(false)
  const [pickingCustomer, setPickingCustomer] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isNew) return
    fetch(`${API_URL}/api/invoices/next-number?type=client_funds`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setForm((previous) => (previous.invoice_number ? previous : { ...previous, invoice_number: data.invoice_number })))
      .catch(() => undefined)
  }, [isNew])

  useEffect(() => {
    fetch(`${API_URL}/api/clients`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setClients)
      .catch(() => setError('Could not load clients.'))
    fetch(`${API_URL}/api/projects`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(setProjects)
      .catch(() => setError('Could not load projects.'))
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
    fetch(`${API_URL}/api/invoices/${id}`)
      .then(async (response) => {
        if (response.status === 404) throw new Error('Invoice not found.')
        if (!response.ok) throw new Error('Could not load invoice.')
        return response.json()
      })
      .then(applyInvoice)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load invoice.'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const update = (field: keyof ReturnType<typeof emptyForm>, value: string) => {
    setSaved(false)
    setForm((previous) => ({ ...previous, [field]: value }))
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

  const lineAmount = (item: ItemForm) => round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))
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
      const response = await fetch(`${API_URL}/api/invoices${isNew ? '' : `/${id}`}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || 'Failed to save the invoice')
      }
      const invoice = await response.json()
      setSaved(true)
      if (isNew) {
        navigate(`/invoices/${invoice.id}/edit`, { replace: true })
      }
      return invoice
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the invoice.')
      return null
    }
  }

  async function handleSave() {
    setBusy(true)
    await save()
    setBusy(false)
  }

  async function handlePreview() {
    setBusy(true)
    const invoice = await save()
    setBusy(false)
    if (invoice) navigate(`/invoices/${invoice.id}/preview`)
  }

  const actions = (
    <div className="doc-actions">
      <button type="button" className="btn-outline" onClick={() => navigate('/invoices')}>
        Back
      </button>
      <button type="button" className="btn-outline" disabled={busy} onClick={locked ? () => navigate(`/invoices/${id}/preview`) : handlePreview}>
        Preview
      </button>
      {!locked && (
        <button type="button" className="btn-pill" disabled={busy} onClick={handleSave}>
          Save and continue
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
    return <p className="empty-state">Loading invoice...</p>
  }

  return (
    <>
      <div className="doc-topbar">
        <h1>{isNew ? 'New Client Funds Invoice' : locked ? 'Client Funds Invoice' : 'Edit Client Funds Invoice'}</h1>
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
          <div className="doc-meta">
            <div className="doc-customer-box">
              {client ? (
                <div className="doc-customer">
                  <strong>{client.name}</strong>
                  <label>
                    Contact person
                    <input value={form.contact_name} onChange={(e) => update('contact_name', e.target.value)} />
                  </label>
                  <div>
                    <button type="button" className="doc-link" onClick={() => setPickingCustomer(true)}>
                      Change
                    </button>{' '}
                    <button type="button" className="doc-link" onClick={() => chooseClient('')}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : pickingCustomer ? (
                <div className="doc-customer">
                  <select autoFocus value="" onChange={(e) => chooseClient(e.target.value)}>
                    <option value="">Select a client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="doc-link" onClick={() => setPickingCustomer(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="doc-add-customer" onClick={() => setPickingCustomer(true)}>
                  <span className="doc-avatar" aria-hidden="true">
                    ◯
                  </span>
                  Add client
                </button>
              )}
              {client && pickingCustomer && (
                <select className="doc-customer-picker" autoFocus value={form.client_id} onChange={(e) => chooseClient(e.target.value)}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="doc-fields">
              <label htmlFor="cf-number">Invoice number</label>
              <div>
                <input id="cf-number" value={form.invoice_number} onChange={(e) => update('invoice_number', e.target.value)} />
                {isNew && <div className="doc-hint">Generated automatically. You can change it.</div>}
              </div>

              <label htmlFor="cf-ref">Reference</label>
              <input id="cf-ref" value={form.customer_ref} onChange={(e) => update('customer_ref', e.target.value)} />

              <label htmlFor="cf-date">Invoice date</label>
              <input id="cf-date" type="date" value={form.invoice_date} onChange={(e) => update('invoice_date', e.target.value)} />

              <label htmlFor="cf-due">Payment due date</label>
              <input
                id="cf-due"
                type="date"
                value={form.due_date}
                min={form.invoice_date || undefined}
                onChange={(e) => update('due_date', e.target.value)}
              />

              <label htmlFor="cf-project">Project</label>
              <div>
                <select id="cf-project" value={form.project_id} onChange={(e) => chooseProject(e.target.value)}>
                  <option value="">Select the project these funds are for</option>
                  {clientProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="doc-hint">Money held for this project's expenses. Choose the client first to narrow the list.</div>
              </div>

              <label htmlFor="cf-location">Project Location</label>
              <input
                id="cf-location"
                value={form.project_location}
                placeholder="e.g. Beirut, Lebanon"
                onChange={(e) => update('project_location', e.target.value)}
              />
            </div>
          </div>

          <div className="doc-notes tall">
            <label htmlFor="cf-introduction">Introduction</label>
            <textarea
              id="cf-introduction"
              value={form.introduction}
              placeholder="e.g. This document confirms funds received from the client to cover project expenses (construction workers, suppliers, materials, site expenses)..."
              onChange={(e) => update('introduction', e.target.value)}
            />
            <div className="doc-hint">Shown before the line items, in the Preview/PDF.</div>
          </div>

          <table className="doc-items">
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Unit Price</th>
                <th>Amount</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.key}>
                  <td className="doc-item-main">
                    <input
                      className="doc-item-name"
                      placeholder="e.g. Advance for construction workers, Material purchases, Supplier payment..."
                      value={item.name}
                      onChange={(e) => updateItem(item.key, 'name', e.target.value)}
                    />
                    <textarea
                      className="doc-item-desc"
                      placeholder="Description (optional). Line breaks are kept."
                      value={item.description}
                      onChange={(e) => updateItem(item.key, 'description', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="doc-item-num"
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Quantity"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.key, 'quantity', e.target.value)}
                    />
                  </td>
                  <td>
                    <select aria-label="Unit" value={item.unit} onChange={(e) => updateItem(item.key, 'unit', e.target.value)}>
                      {UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="doc-item-num"
                      type="number"
                      min="0"
                      step="any"
                      aria-label="Unit price"
                      value={item.unit_price}
                      onChange={(e) => updateItem(item.key, 'unit_price', e.target.value)}
                    />
                  </td>
                  <td className="doc-amount">{formatMoney(lineAmount(item), form.currency)}</td>
                  <td className="doc-item-actions">
                    <button type="button" className="doc-icon" title="Move up" aria-label="Move up" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="doc-icon"
                      title="Move down"
                      aria-label="Move down"
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="doc-icon doc-icon-delete"
                      title="Delete item"
                      aria-label="Delete item"
                      onClick={() => {
                        setSaved(false)
                        setItems((previous) => previous.filter((row) => row.key !== item.key))
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={6}>
                  <button
                    type="button"
                    className="doc-link"
                    onClick={() => {
                      setSaved(false)
                      setItems((previous) => [...previous, newItem()])
                    }}
                  >
                    ⊕ Add item
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="doc-totals">
            <div>Subtotal</div>
            <div>{formatMoney(subtotal, form.currency)}</div>
            <div className="doc-discount-row">
              <span>Discount</span>
              <select aria-label="Discount type" value={form.discount_type} onChange={(e) => update('discount_type', e.target.value)}>
                <option value="fixed">Fixed amount</option>
                <option value="percent">Percentage %</option>
              </select>
              <input
                type="number"
                min="0"
                step="any"
                aria-label="Discount value"
                value={form.discount_value}
                onChange={(e) => update('discount_value', e.target.value)}
              />
            </div>
            <div>{discount > 0 ? `(${formatMoney(discount, form.currency)})` : formatMoney(0, form.currency)}</div>
            <div className="doc-total-row">
              <strong>Total</strong>
              <select value={form.currency} onChange={(e) => update('currency', e.target.value)} aria-label="Currency">
                {CURRENCIES.map((currency) => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <strong>{formatMoney(total, form.currency)}</strong>
            </div>
          </div>

          <div className="doc-terms">
            {TERMS_SECTIONS.map((section) => (
              <div key={section.field} className={`doc-notes${section.tall ? ' tall' : ''}`}>
                <label htmlFor={`cf-${section.field}`}>{section.label}</label>
                <textarea
                  id={`cf-${section.field}`}
                  value={form[section.field]}
                  placeholder={section.placeholder}
                  onChange={(e) => update(section.field, e.target.value)}
                />
              </div>
            ))}
          </div>
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
