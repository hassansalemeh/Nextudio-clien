import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { COMPANY } from '../companyProfile'
import { useConfirm } from '../components/ConfirmDialog'
import { InvoiceIcon } from '../components/icons'
import { localDateString } from '../timeUtils'

const API_URL = import.meta.env.VITE_API_URL ?? ''

type Client = {
  id: string
  name: string
  contact_name: string | null
}

type Project = {
  id: string
  name: string
  source_estimate_id: string | null
}

type ItemForm = {
  key: number
  name: string
  description: string
  quantity: string
  unit: string
  unit_price: string
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

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

// The four sections printed under the services table, in this order
const TERMS_SECTIONS: { field: 'payment_terms' | 'timeline' | 'notes' | 'exclusions'; label: string; placeholder: string; tall?: boolean }[] = [
  { field: 'payment_terms', label: 'Payment Terms', placeholder: 'e.g. 1- 35% upon signing the agreement...' },
  { field: 'timeline', label: 'Timeline', placeholder: 'e.g. Phase 1 - Concept Design | 3-4 weeks...' },
  { field: 'notes', label: 'Notes', placeholder: 'General notes for the client...' },
  { field: 'exclusions', label: 'Exclusions', placeholder: 'What is not included in this quotation...', tall: true },
]

const round2 = (n: number) => Math.round(n * 100) / 100

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

// New estimates are valid for 30 days by default
function defaultValidUntil() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return localDateString(date)
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

function emptyForm() {
  return {
    title: 'Quotation',
    summary: '',
    client_id: '',
    contact_name: '',
    customer_ref: '',
    estimate_number: '',
    estimate_date: localDateString(),
    valid_until: defaultValidUntil(),
    currency: 'USD',
    status: 'draft',
    notes: '',
    payment_terms: '',
    timeline: '',
    exclusions: '',
    discount_type: 'fixed',
    discount_value: '',
    project_id: '',
  }
}

let nextKey = 1
const newItem = (): ItemForm => ({ key: nextKey++, name: '', description: '', quantity: '1', unit: 'sqm', unit_price: '' })

function EstimateEditorPage() {
  const confirm = useConfirm()
  const { id } = useParams()
  const navigate = useNavigate()
  // /estimates/new and /estimates/:id are the same route, so saving a new estimate does not remount the editor
  const isNew = id === 'new'
  const justSavedId = useRef<string | null>(null)

  const [form, setForm] = useState(emptyForm())
  const [items, setItems] = useState<ItemForm[]>([])
  const [links, setLinks] = useState<{ invoice_id: string | null; invoice_number: string | null; project_id: string | null; approved_at: string | null }>({
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
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  // A new estimate gets the next free number automatically; the field stays editable
  useEffect(() => {
    if (!isNew) return
    fetch(`${API_URL}/api/estimates/next-number`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setForm((previous) => (previous.estimate_number ? previous : { ...previous, estimate_number: data.estimate_number })))
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
      project_id: estimate.project_id ?? '',
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
    fetch(`${API_URL}/api/estimates/${id}`)
      .then(async (response) => {
        if (response.status === 404) throw new Error('Estimate not found.')
        if (!response.ok) throw new Error('Could not load estimate.')
        return response.json()
      })
      .then(applyEstimate)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load estimate.'))
      .finally(() => setLoading(false))
  }, [id, isNew])

  const locked = !isNew && form.status === 'approved'

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

  // Live numbers while typing. The server recalculates the same totals when saving, and rejects anything inconsistent.
  const lineAmount = (item: ItemForm) => round2((Number(item.quantity) || 0) * (Number(item.unit_price) || 0))
  const subtotal = round2(items.reduce((sum, item) => sum + lineAmount(item), 0))
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
      if (!(Number(item.quantity) > 0)) return setError(`Item ${index + 1}: quantity must be greater than 0.`), null
      if (item.unit_price === '' || Number(item.unit_price) < 0) return setError(`Item ${index + 1}: enter the unit price.`), null
    }
    if (form.discount_type === 'percent' && discountValue > 100) return setError('A percentage discount cannot be more than 100%.'), null
    if (discount > subtotal) return setError('The discount cannot be more than the subtotal.'), null

    try {
      const response = await fetch(`${API_URL}/api/estimates${isNew ? '' : `/${id}`}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          client_id: form.client_id || null,
          project_id: form.project_id || null,
          valid_until: form.valid_until || null,
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
        throw new Error(body?.error || 'Failed to save estimate')
      }
      const estimate = await response.json()
      applyEstimate(estimate)
      setSaved(true)
      if (isNew) {
        justSavedId.current = String(estimate.id)
        navigate(`/estimates/${estimate.id}`, { replace: true })
      }
      return estimate
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save estimate.')
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
        const response = await fetch(`${API_URL}/api/estimates/${estimate.id}/approve`, { method: 'POST' })
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error || 'Failed to approve estimate')
        applyEstimate(body)
        setSaved(false)
        approved = body
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not approve the estimate.')
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

  const actions = (
    <div className="doc-actions">
      <button type="button" className="btn-outline" onClick={() => navigate('/estimates')}>
        Back
      </button>
      <button type="button" className="btn-outline" disabled={busy} onClick={locked ? () => navigate(`/estimates/${id}/preview`) : handlePreview}>
        Preview
      </button>
      {!locked && (
        <button type="button" className="btn-pill" disabled={busy} onClick={handleSave}>
          Save and continue
        </button>
      )}
      {!isNew && !locked && form.status !== 'rejected' && (
        <button type="button" className="btn-convert" disabled={busy} onClick={handleConvert} title="Use this when the client has approved the quotation">
          <InvoiceIcon /> Convert to Invoice
        </button>
      )}
      {locked && links.invoice_id && (
        <button type="button" className="btn-convert" onClick={() => navigate(`/invoices/${links.invoice_id}`)}>
          <InvoiceIcon /> View Invoice
        </button>
      )}
    </div>
  )

  if (loading) {
    return <p className="empty-state">Loading estimate...</p>
  }

  const daysValid = form.valid_until && form.estimate_date ? daysBetween(form.estimate_date, form.valid_until) : null
  const availableProjects = projects.filter((p) => !p.source_estimate_id || p.id === form.project_id)

  return (
    <>
      <div className="doc-topbar">
        <h1>{isNew ? 'New estimate' : locked ? 'Approved estimate' : 'Edit estimate'}</h1>
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
        {/* Business address and contact details, title, summary, and logo */}
        <div className="doc-panel">
          <button type="button" className="doc-panel-header" onClick={() => setHeaderOpen(!headerOpen)}>
            <span>Business address and contact details, title, summary, and logo</span>
            <span className={`doc-chevron${headerOpen ? ' open' : ''}`}>⌃</span>
          </button>
          {headerOpen && (
            <div className="doc-panel-body">
              <img className="doc-logo-img" src="/nextudio-logo.webp" alt="Nextudio architects" />
              <div>
                <input className="doc-title-input" value={form.title} placeholder="Quotation" onChange={(e) => update('title', e.target.value)} />
                <input
                  className="doc-summary-input"
                  value={form.summary}
                  placeholder="Summary (e.g. project name, description of estimate)"
                  onChange={(e) => update('summary', e.target.value)}
                />
                <div className="doc-address">
                  <strong>{COMPANY.name}</strong>
                  {COMPANY.addressLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                  <div>Phone: {COMPANY.phone}</div>
                  <div>Mobile: {COMPANY.mobile}</div>
                  <div>{COMPANY.website}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* The estimate sheet */}
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
                    <option value="">Select a customer</option>
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
                  Add customer
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
              <label htmlFor="est-number">Estimate number</label>
              <div>
                <input id="est-number" value={form.estimate_number} onChange={(e) => update('estimate_number', e.target.value)} />
                {isNew && <div className="doc-hint">Generated automatically. You can change it.</div>}
              </div>

              <label htmlFor="est-ref">Customer ref</label>
              <input id="est-ref" value={form.customer_ref} onChange={(e) => update('customer_ref', e.target.value)} />

              <label htmlFor="est-date">Date</label>
              <input id="est-date" type="date" value={form.estimate_date} onChange={(e) => update('estimate_date', e.target.value)} />

              <label htmlFor="est-valid">Valid until</label>
              <div>
                <input
                  id="est-valid"
                  type="date"
                  value={form.valid_until}
                  min={form.estimate_date || undefined}
                  onChange={(e) => update('valid_until', e.target.value)}
                />
                {daysValid !== null && daysValid >= 0 && <div className="doc-hint">Within {daysValid} days</div>}
              </div>

              <label htmlFor="est-project">Project</label>
              <div>
                <select id="est-project" value={form.project_id} onChange={(e) => update('project_id', e.target.value)}>
                  <option value="">Create a new project on approval</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="doc-hint">Pick an existing project to confirm it with this estimate's total.</div>
              </div>

              <label htmlFor="est-status">Status</label>
              <select id="est-status" value={form.status} onChange={(e) => handleStatusChange(e.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <table className="doc-items">
            <thead>
              <tr>
                <th>Services</th>
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
                      placeholder="Service (e.g. CD - Concept Design)"
                      value={item.name}
                      onChange={(e) => updateItem(item.key, 'name', e.target.value)}
                    />
                    <textarea
                      className="doc-item-desc"
                      placeholder="Description (scope, deliverables...). Line breaks are kept."
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
              <select
                aria-label="Discount type"
                value={form.discount_type}
                onChange={(e) => update('discount_type', e.target.value)}
              >
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
              <strong>Grand Total</strong>
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
                <label htmlFor={`est-${section.field}`}>{section.label}</label>
                <textarea
                  id={`est-${section.field}`}
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
    </>
  )
}

export default EstimateEditorPage
