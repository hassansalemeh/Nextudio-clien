import { CLIENT_FUNDS_CURRENCIES, CLIENT_FUNDS_TERMS_SECTIONS, CLIENT_FUNDS_UNITS } from '../constants'
import type { ClientFundsItemForm } from '../types'

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

type Props = {
  introduction: string
  onIntroductionChange: (value: string) => void
  items: ClientFundsItemForm[]
  lineAmount: (item: ClientFundsItemForm) => number
  currency: string
  updateItem: (key: number, field: keyof ClientFundsItemForm, value: string) => void
  moveItem: (index: number, direction: -1 | 1) => void
  deleteItem: (key: number) => void
  addItem: () => void
  subtotal: number
  discountType: string
  onDiscountTypeChange: (value: string) => void
  discountValue: string
  onDiscountValueChange: (value: string) => void
  discount: number
  onCurrencyChange: (value: string) => void
  total: number
  termValues: Record<'payment_terms' | 'timeline' | 'notes' | 'exclusions', string>
  onTermChange: (field: 'payment_terms' | 'timeline' | 'notes' | 'exclusions', value: string) => void
}

function ClientFundsItemsSection({
  introduction,
  onIntroductionChange,
  items,
  lineAmount,
  currency,
  updateItem,
  moveItem,
  deleteItem,
  addItem,
  subtotal,
  discountType,
  onDiscountTypeChange,
  discountValue,
  onDiscountValueChange,
  discount,
  onCurrencyChange,
  total,
  termValues,
  onTermChange,
}: Props) {
  return (
    <>
      <div className="doc-notes tall">
        <label htmlFor="cf-introduction">Introduction</label>
        <textarea
          id="cf-introduction"
          value={introduction}
          placeholder="e.g. This document confirms funds received from the client to cover project expenses (construction workers, suppliers, materials, site expenses)..."
          onChange={(e) => onIntroductionChange(e.target.value)}
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
                  {CLIENT_FUNDS_UNITS.map((unit) => (
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
              <td className="doc-amount">{formatMoney(lineAmount(item), currency)}</td>
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
                  onClick={() => deleteItem(item.key)}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={6}>
              <button type="button" className="doc-link" onClick={addItem}>
                ⊕ Add item
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="doc-totals">
        <div>Subtotal</div>
        <div>{formatMoney(subtotal, currency)}</div>
        <div className="doc-discount-row">
          <span>Discount</span>
          <select aria-label="Discount type" value={discountType} onChange={(e) => onDiscountTypeChange(e.target.value)}>
            <option value="fixed">Fixed amount</option>
            <option value="percent">Percentage %</option>
          </select>
          <input
            type="number"
            min="0"
            step="any"
            aria-label="Discount value"
            value={discountValue}
            onChange={(e) => onDiscountValueChange(e.target.value)}
          />
        </div>
        <div>{discount > 0 ? `(${formatMoney(discount, currency)})` : formatMoney(0, currency)}</div>
        <div className="doc-total-row">
          <strong>Total</strong>
          <select value={currency} onChange={(e) => onCurrencyChange(e.target.value)} aria-label="Currency">
            {CLIENT_FUNDS_CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <strong>{formatMoney(total, currency)}</strong>
        </div>
      </div>

      <div className="doc-terms">
        {CLIENT_FUNDS_TERMS_SECTIONS.map((section) => (
          <div key={section.field} className={`doc-notes${section.tall ? ' tall' : ''}`}>
            <label htmlFor={`cf-${section.field}`}>{section.label}</label>
            <textarea
              id={`cf-${section.field}`}
              value={termValues[section.field]}
              placeholder={section.placeholder}
              onChange={(e) => onTermChange(section.field, e.target.value)}
            />
          </div>
        ))}
      </div>
    </>
  )
}

export default ClientFundsItemsSection
